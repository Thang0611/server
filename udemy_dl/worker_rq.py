"""
Redis-based Worker for processing Udemy course downloads
Uses simple Redis list for job queue (compatible with Node.js)
"""

import mysql.connector
import subprocess
import os
import shutil
import sys
import json
from datetime import datetime
from dotenv import load_dotenv
import requests
import hmac
import hashlib
import time
import redis

# ================= 1. SETUP =================
# Load .env
env_paths = [
    os.path.join(os.path.dirname(__file__), '../.env'),
    os.path.join(os.path.dirname(__file__), './.env')
]
env_path = next((p for p in env_paths if os.path.exists(p)), None)
load_dotenv(dotenv_path=env_path)

def log(msg):
    """Log with timestamp"""
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}")

# Check required environment variables
REQUIRED = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'UDEMY_TOKEN']
if any(not os.getenv(v) for v in REQUIRED):
    log("[CRITICAL] Missing required environment variables")
    sys.exit(1)

# Database configuration
DB_CONFIG = {
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'host': os.getenv('DB_HOST'),
    'database': os.getenv('DB_NAME'),
    'connection_timeout': 300,
    'autocommit': True
}

# Download configuration
UDEMY_TOKEN = os.getenv('UDEMY_TOKEN')
STAGING_DIR = "Staging_Download"
RCLONE_REMOTE = "gdrive"
RCLONE_DEST_PATH = "UdemyCourses/download_khoahoc"
MAX_RETRIES = 3
DOWNLOAD_TIMEOUT = 144000  # 40 hours

# ================= 2. HELPER FUNCTIONS =================

def get_db_connection():
    """Create a new MySQL connection"""
    return mysql.connector.connect(**DB_CONFIG)

def clean_staging(task_id=None):
    """
    Clean staging directory
    If task_id is provided, only clean that specific task sandbox
    """
    if task_id:
        # Clean specific task directory
        task_dir = os.path.join(STAGING_DIR, f"Task_{task_id}")
        if os.path.exists(task_dir):
            try:
                shutil.rmtree(task_dir)
                log(f"[CLEAN] Removed task directory: Task_{task_id}")
            except Exception as e:
                log(f"[WARN] Cannot remove task dir Task_{task_id}: {e}")
    else:
        # Clean entire staging directory (used on worker startup)
        if os.path.exists(STAGING_DIR):
            try:
                shutil.rmtree(STAGING_DIR)
            except Exception as e:
                log(f"[WARN] Cannot remove staging dir: {e}")
        os.makedirs(STAGING_DIR, exist_ok=True)

def upload_to_drive(local_path):
    """Upload folder to Google Drive using Rclone"""
    folder_name = os.path.basename(local_path)
    remote_path = f"{RCLONE_REMOTE}:{RCLONE_DEST_PATH}/{folder_name}"
    
    log(f"[RCLONE] Start upload: {folder_name}")
    cmd = ["rclone", "move", local_path, remote_path, "-P", "--transfers=8", "--checkers=16"]
    
    try:
        subprocess.run(cmd, check=True)
        log("[RCLONE] Upload successful")
        return True
    except subprocess.CalledProcessError as e:
        log(f"[RCLONE] Upload failed: {e}")
        return False

def update_task_status(task_id, status):
    """Update task status in MySQL database"""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE download_tasks SET status = %s, updated_at = NOW() WHERE id = %s",
            (status, task_id)
        )
        conn.commit()
        log(f"[DB] Task {task_id} status -> {status}")
    except Exception as e:
        log(f"[DB ERR] Failed to update task {task_id}: {e}")
    finally:
        if conn:
            conn.close()

def notify_node_webhook(task_id, folder_name_local):
    """
    Call Node.js webhook to update drive_url and send email
    Uses HMAC-SHA256 for authentication + secret_key in body for compatibility
    """
    api_url = "https://api.khoahocgiare.info/api/v1/webhook/finalize"
    secret = os.getenv('API_SECRET_KEY') or "KEY_BAO_MAT_CUA_BAN_2025"
    folder_name_only = os.path.basename(folder_name_local)
    
    # Create timestamp
    timestamp = str(int(time.time()))
    
    # ✅ FIX: Thêm secret_key vào body để tương thích với Node.js controller
    payload = {
        "secret_key": secret,  # ← Thêm dòng này
        "task_id": task_id,
        "folder_name": folder_name_only,
        "timestamp": timestamp
    }
    
    # Create HMAC signature
    message = f"{task_id}{folder_name_only}{timestamp}"
    signature = hmac.new(
        secret.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    # Headers with signature
    headers = {
        "Content-Type": "application/json",
        "X-Signature": signature,
        "X-Timestamp": timestamp
    }
    
    try:
        log(f"[API] Calling webhook with HMAC auth: {folder_name_only}")
        res = requests.post(api_url, json=payload, headers=headers, timeout=30)
        if res.status_code == 200:
            log(f"[API] Webhook successful: {folder_name_only}")
            return True
        else:
            log(f"[API FAIL] Status: {res.status_code} - {res.text}")
            return False
    except Exception as e:
        log(f"[API ERR] {e}")
        return False

# ================= 3. MAIN PROCESSING FUNCTION =================

def process_download(task_data):
    """
    Main function to process a download task
    ✅ IMPROVED: Task isolation + Smart retry with resume capability
    
    Args:
        task_data (dict): Job data from Redis queue
            - taskId (int): Download task ID from MySQL
            - email (str): User email
            - courseUrl (str): Course URL to download
    
    Returns:
        dict: Processing result with success status
    """
    task_id = task_data.get('taskId')
    email = task_data.get('email')
    course_url = task_data.get('courseUrl')
    
    log("="*60)
    log(f"[RQ JOB] Processing download job")
    log(f"[*] Task ID: {task_id}")
    log(f"[*] Email: {email}")
    log(f"[*] URL: {course_url}")
    log("="*60)
    
    # Validate inputs
    if not all([task_id, email, course_url]):
        log("[ERROR] Missing required job data")
        return {
            'success': False,
            'error': 'Missing required job data',
            'taskId': task_id
        }
    
    # ✅ FIX: Create task-specific sandbox directory
    task_sandbox = os.path.join(STAGING_DIR, f"Task_{task_id}")
    os.makedirs(task_sandbox, exist_ok=True)
    log(f"[SANDBOX] Task directory: {task_sandbox}")
    
    success = False
    final_folder = None
    webhook_success = False
    
    # Retry loop
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            log(f"[ATTEMPT {attempt}/{MAX_RETRIES}] Downloading course...")
            
            # ✅ FIX: Download into task-specific directory
            cmd = [
                sys.executable, "main.py",
                "-c", course_url,
                "-o", task_sandbox,  # ← Changed from STAGING_DIR
                "-q", "720",
                "--download-captions",
                "--download-assets",
                "--download-quizzes",
                "--concurrent-downloads", "10",
                "--continue-lecture-numbers"
            ]
            
            # Run download process
            log(f"[DOWNLOAD] Command: {' '.join(cmd)}")
            subprocess.run(cmd, check=True, timeout=DOWNLOAD_TIMEOUT)
            
            # Check for output folder
            subdirs = [f.path for f in os.scandir(task_sandbox) if f.is_dir()]
            if not subdirs:
                raise Exception("No output folder found after download")
            
            final_folder = subdirs[0]
            log(f"[CHECK] Downloaded: {os.path.basename(final_folder)}")
            
            # Upload to Google Drive
            log(f"[UPLOAD] Starting upload to Google Drive...")
            if upload_to_drive(final_folder):
                log(f"[UPLOAD] Upload successful!")
                success = True
                break  # Exit retry loop on success
            else:
                raise Exception("Rclone upload failed")
        
        except subprocess.TimeoutExpired:
            log(f"[TIMEOUT] Download exceeded {DOWNLOAD_TIMEOUT}s")
        except subprocess.CalledProcessError as e:
            log(f"[ERROR] main.py failed with exit code {e.returncode}")
        except Exception as e:
            log(f"[ERROR] {e}")
        
        # ✅ SMART RETRY: Don't clean staging on failure (allow resume)
        if attempt < MAX_RETRIES:
            log(f"[RESUME] Keeping downloaded files for resume on next attempt...")
            log(f"[INFO] Retrying in 20 seconds...")
            time.sleep(20)
    
    # Process result
    if success and final_folder:
        # Update database to 'completed'
        update_task_status(task_id, 'completed')
        
        # Notify Node.js to update drive_url and send email
        log(f"[WEBHOOK] Calling Node.js webhook...")
        webhook_success = notify_node_webhook(task_id, final_folder)
        
        # ✅ ONLY clean if EVERYTHING succeeded (upload + webhook)
        if webhook_success:
            clean_staging(task_id)
            log("[CLEANUP] Task sandbox removed (all steps completed)")
        else:
            log("[KEEP] Webhook failed, keeping files for manual inspection")
        
        log("[SUCCESS] Task completed successfully")
        return {
            'success': True,
            'taskId': task_id,
            'folder': os.path.basename(final_folder)
        }
    else:
        # Update database to 'failed'
        update_task_status(task_id, 'failed')
        
        # ✅ KEEP failed folder for debugging (don't clean)
        log(f"[FAILED] Task failed after {MAX_RETRIES} retries")
        log(f"[DEBUG] Failed files kept at: {task_sandbox}")
        log(f"[DEBUG] You can manually inspect or retry this task")
        
        log("[FAILED] Task failed after retries")
        return {
            'success': False,
            'taskId': task_id,
            'error': 'Download or upload failed after retries'
        }

# ================= 4. REDIS QUEUE CONSUMER =================

def start_worker(worker_id=1):
    """
    Start Redis queue consumer
    Continuously polls Redis list for jobs and processes them
    """
    log(f">>> REDIS WORKER #{worker_id} STARTED <<<")
    log(f"Listening to queue: rq:queue:downloads")
    
    # Connect to Redis
    redis_host = os.getenv('REDIS_HOST', 'localhost')
    redis_port = int(os.getenv('REDIS_PORT', 6379))
    redis_password = os.getenv('REDIS_PASSWORD', None)
    
    r = redis.Redis(
        host=redis_host,
        port=redis_port,
        password=redis_password if redis_password else None,
        decode_responses=True
    )
    
    # Test connection
    try:
        r.ping()
        log(f"[REDIS] Connected to {redis_host}:{redis_port}")
    except Exception as e:
        log(f"[REDIS ERROR] Cannot connect: {e}")
        sys.exit(1)
    
    queue_key = 'rq:queue:downloads'
    
    # Main worker loop
    while True:
        try:
            # Block and wait for job (BRPOP - blocking right pop)
            # Timeout: 5 seconds
            result = r.brpop(queue_key, timeout=5)
            
            if result:
                queue_name, job_json = result
                log(f"[WORKER #{worker_id}] Received job from {queue_name}")
                
                # Parse job data
                try:
                    job_data = json.loads(job_json)
                    log(f"[WORKER #{worker_id}] Job data: {job_data}")
                    
                    # Process the download
                    result = process_download(job_data)
                    
                    if result['success']:
                        log(f"[WORKER #{worker_id}] ✅ Job completed: Task {job_data.get('taskId')}")
                    else:
                        log(f"[WORKER #{worker_id}] ❌ Job failed: Task {job_data.get('taskId')}")
                        
                except json.JSONDecodeError as e:
                    log(f"[WORKER #{worker_id}] [ERROR] Invalid job JSON: {e}")
                except Exception as e:
                    log(f"[WORKER #{worker_id}] [ERROR] Processing failed: {e}")
            else:
                # No job available (timeout), continue waiting
                pass
                
        except redis.ConnectionError as e:
            log(f"[WORKER #{worker_id}] [REDIS ERROR] Connection lost: {e}")
            log(f"[WORKER #{worker_id}] Reconnecting in 5 seconds...")
            time.sleep(5)
            try:
                r.ping()
                log(f"[WORKER #{worker_id}] [REDIS] Reconnected!")
            except:
                log(f"[WORKER #{worker_id}] [REDIS] Still cannot connect")
                
        except KeyboardInterrupt:
            log(f"[WORKER #{worker_id}] Shutting down gracefully...")
            break
        except Exception as e:
            log(f"[WORKER #{worker_id}] [ERROR] Unexpected error: {e}")
            time.sleep(5)
    
    log(f"[WORKER #{worker_id}] Worker stopped.")

# ================= 5. MAIN ENTRY POINT =================

if __name__ == "__main__":
    """
    Start Redis queue worker
    Usage: 
      - Direct: python3 worker_rq.py [worker_id]
      - PM2: worker_id is auto-assigned from INSTANCE_ID env var
    """
    import sys
    
    # PM2 sets INSTANCE_ID (0, 1, 2, 3, 4...) - convert to worker_id (1, 2, 3, 4, 5...)
    if os.getenv('INSTANCE_ID'):
        worker_id = int(os.getenv('INSTANCE_ID')) + 1
        log(f"[PM2] Using INSTANCE_ID={os.getenv('INSTANCE_ID')} -> Worker #{worker_id}")
    else:
        # Fallback for direct execution
        worker_id = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    
    try:
        start_worker(worker_id)
    except KeyboardInterrupt:
        print("\nWorker stopped by user.")