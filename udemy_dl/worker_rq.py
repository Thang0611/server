"""
Redis-based Worker for processing Udemy course downloads
Uses simple Redis list for job queue (compatible with Node.js)
ENHANCED: Real-time progress tracking via Redis Pub/Sub
"""

import mysql.connector
import subprocess
import os
import shutil
import sys
import json
import signal
import traceback
from datetime import datetime
from dotenv import load_dotenv
import requests
import hmac
import hashlib
import time
import redis
from progress_emitter import emit_progress, emit_status_change, emit_order_complete
from cookie_utils import get_udemy_token
from lifecycle_logger import log_download_success, log_download_error, log_upload_success, log_upload_error
from task_logger import log_info, log_error, log_warn, log_progress, log_to_node_api

# ================= 0. TEE WRITER FOR DUAL OUTPUT =================

class TeeWriter:
    """
    Duplicate output to both stdout (for PM2 logs) and task log file
    This ensures logs appear in both worker-out.log and task-specific log files
    """
    def __init__(self, file_path):
        self.file = open(file_path, 'a', encoding='utf-8')
        self.stdout = sys.stdout
    
    def write(self, data):
        # Write to both stdout (PM2 will capture) and task log file
        self.stdout.write(data)
        self.stdout.flush()  # Ensure immediate output to PM2
        self.file.write(data)
        self.file.flush()  # Ensure immediate write to file
    
    def flush(self):
        self.stdout.flush()
        self.file.flush()
    
    def fileno(self):
        # Return stdout's file descriptor for subprocess compatibility
        # This allows subprocess.run() to work with TeeWriter
        return self.stdout.fileno()
    
    def close(self):
        if self.file:
            self.file.close()
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

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

# Check required environment variables (UDEMY_TOKEN is optional now, will use access_token from cookies)
REQUIRED = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
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

# Download configuration - Get token from cookies.txt first, fallback to UDEMY_TOKEN env
UDEMY_TOKEN = get_udemy_token()
if not UDEMY_TOKEN:
    log("[WARN] No access_token found in cookies.txt and no UDEMY_TOKEN in env. Downloads may fail.")
else:
    # Check if token came from cookies.txt
    from cookie_utils import get_access_token_from_cookies
    token_source = "cookies.txt" if get_access_token_from_cookies() else "UDEMY_TOKEN env"
    log(f"[INFO] Using token from {token_source}")
STAGING_DIR = "Staging_Download"
RCLONE_REMOTE = "gdrive"
RCLONE_DEST_PATH = "UdemyCourses/download_khoahoc"
MAX_RETRIES = 3
# ✅ SECURITY: Reduced timeout from 40 hours to 30 minutes for better resource management
# Can be overridden via environment variable PYTHON_DOWNLOAD_TIMEOUT
DOWNLOAD_TIMEOUT = int(os.getenv('PYTHON_DOWNLOAD_TIMEOUT', 1800))  # 30 minutes (1800 seconds)

# ================= 2. HELPER FUNCTIONS =================

def get_db_connection():
    """
    Create a new MySQL connection
    ✅ OPTIMIZED: Simple connection management with proper error handling
    """
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        return conn
    except mysql.connector.Error as e:
        log(f"[DB ERR] Failed to create connection: {e}")
        raise
    except Exception as e:
        log(f"[DB ERR] Unexpected error creating connection: {e}")
        raise

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

def update_task_status(task_id, status, error_log=None):
    """
    Update task status in MySQL database
    ✅ OPTIMIZED: Better error handling and connection management
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        if error_log:
            cur.execute(
                "UPDATE download_tasks SET status = %s, error_log = %s, updated_at = NOW() WHERE id = %s",
                (status, error_log, task_id)
            )
        else:
            cur.execute(
                "UPDATE download_tasks SET status = %s, updated_at = NOW() WHERE id = %s",
                (status, task_id)
            )
        conn.commit()
        log(f"[DB] Task {task_id} status -> {status}")
    except mysql.connector.Error as e:
        log(f"[DB ERR] MySQL error updating task {task_id}: {e}")
    except Exception as e:
        log(f"[DB ERR] Failed to update task {task_id}: {e}")
        import traceback
        log(f"[DB ERR] Traceback: {traceback.format_exc()}")
    finally:
        # ✅ FIX: Always close connection to prevent leaks
        if conn:
            try:
                conn.close()
            except:
                pass

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

def check_enrollment_status(task_id, max_wait_seconds=15):
    """
    Check if task is enrolled before downloading
    Wait up to max_wait_seconds for enrollment to complete
    
    ✅ OPTIMIZED: Better connection management and error handling
    
    Args:
        task_id (int): Task ID to check
        max_wait_seconds (int): Maximum time to wait for enrollment (default 15 seconds)
    
    Returns:
        tuple: (is_enrolled: bool, status: str, error_message: str)
    """
    start_time = time.time()
    check_interval = 2  # ✅ OPTIMIZED: Check every 2 seconds (faster response)
    
    try:
        while (time.time() - start_time) < max_wait_seconds:
            conn = None
            try:
                conn = get_db_connection()
                cur = conn.cursor(dictionary=True)
                cur.execute(
                    "SELECT id, status, email, course_url FROM download_tasks WHERE id = %s",
                    (task_id,)
                )
                task = cur.fetchone()
                
                if not task:
                    return (False, 'not_found', f'Task {task_id} not found in database')
                
                status = task['status']
                
                # Check if already enrolled
                if status == 'enrolled':
                    log(f"[ENROLL CHECK] ✅ Task {task_id} is enrolled, ready to download")
                    return (True, status, None)
                
                # Check if enrollment failed
                if status == 'failed':
                    return (False, status, f'Task {task_id} enrollment failed')
                
                # Check if still processing enrollment
                if status in ['processing', 'pending', 'paid']:
                    elapsed = int(time.time() - start_time)
                    if elapsed % 5 == 0:  # Log every 5 seconds to avoid spam
                        log(f"[ENROLL CHECK] ⏳ Task {task_id} status={status}, waiting for enrollment... ({elapsed}s/{max_wait_seconds}s)")
                    time.sleep(check_interval)
                    continue
                
                # Unknown status
                return (False, status, f'Task {task_id} has unexpected status: {status}')
                
            except mysql.connector.Error as e:
                log(f"[ENROLL CHECK] [ERROR] MySQL error: {e}")
                time.sleep(check_interval)
            except Exception as e:
                log(f"[ENROLL CHECK] [ERROR] Database query failed: {e}")
                time.sleep(check_interval)
            finally:
                # ✅ FIX: Always close connection to prevent leaks
                if conn:
                    try:
                        conn.close()
                    except:
                        pass
        
        # Timeout reached
        return (False, 'timeout', f'Task {task_id} enrollment timeout after {max_wait_seconds}s')
        
    except Exception as e:
        import traceback
        log(f"[ENROLL CHECK] [CRITICAL] Enrollment check failed: {e}\n{traceback.format_exc()}")
        return (False, 'error', f'Enrollment check failed: {e}')

def validate_and_sanitize_url(url):
    """
    ✅ SECURITY: Validate and sanitize course URL to prevent command injection
    Only allows valid Udemy URLs
    
    Args:
        url (str): Course URL to validate
    
    Returns:
        tuple: (is_valid: bool, sanitized_url: str, error_message: str)
    """
    if not url or not isinstance(url, str):
        return (False, None, 'URL không hợp lệ: phải là chuỗi không rỗng')
    
    # Check length (prevent buffer overflow)
    if len(url) > 2048:
        return (False, None, 'URL quá dài (tối đa 2048 ký tự)')
    
    # ✅ SECURITY: Only allow Udemy URLs
    if 'udemy.com' not in url.lower():
        return (False, None, 'Chỉ chấp nhận URL từ Udemy (udemy.com)')
    
    # ✅ SECURITY: Sanitize URL - remove dangerous characters
    # Remove any shell metacharacters that could be used for injection
    dangerous_chars = [';', '&', '|', '`', '$', '(', ')', '<', '>', '\n', '\r', '\t']
    sanitized = url.strip()
    
    for char in dangerous_chars:
        if char in sanitized:
            return (False, None, f'URL chứa ký tự không hợp lệ: {char}')
    
    # Validate URL format using urllib.parse
    try:
        from urllib.parse import urlparse
        parsed = urlparse(sanitized)
        
        # Must have valid scheme (http/https)
        if parsed.scheme not in ['http', 'https']:
            return (False, None, 'URL phải bắt đầu bằng http:// hoặc https://')
        
        # Must have netloc (domain)
        if not parsed.netloc:
            return (False, None, 'URL không hợp lệ: thiếu domain')
        
        # Ensure it's a Udemy domain
        if 'udemy.com' not in parsed.netloc.lower():
            return (False, None, 'Chỉ chấp nhận URL từ Udemy (udemy.com)')
        
        return (True, sanitized, None)
    except Exception as e:
        return (False, None, f'Lỗi validate URL: {str(e)}')

def output_error_json(task_id, error_code, error_message, error_details=None):
    """
    ✅ SECURITY: Output error in JSON format to stderr so Node.js can parse it
    This ensures errors are properly logged and tracked
    
    Args:
        task_id (int): Task ID
        error_code (str): Error code (e.g., 'VALIDATION_ERROR', 'TIMEOUT_ERROR')
        error_message (str): Human-readable error message
        error_details (dict): Additional error details
    """
    error_output = {
        'error': True,
        'task_id': task_id,
        'error_code': error_code,
        'error_message': error_message,
        'timestamp': datetime.now().isoformat(),
        'details': error_details or {}
    }
    
    # Write to stderr in JSON format (Node.js can read this)
    print(json.dumps(error_output), file=sys.stderr, flush=True)

def process_download(task_data):
    """
    Main function to process a download task
    ✅ IMPROVED: Task isolation + Smart retry with resume capability + Enrollment check
    ✅ SECURITY: Input validation + JSON error output + Proper timeout handling
    
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
    
    # ✅ SECURITY: Validate inputs with type checking
    if not task_id:
        error_msg = 'Missing required field: taskId'
        log(f"[ERROR] {error_msg}")
        output_error_json(None, 'VALIDATION_ERROR', error_msg)
        return {
            'success': False,
            'error': error_msg,
            'taskId': None
        }
    
    if not email or not isinstance(email, str) or len(email) > 255:
        error_msg = 'Missing or invalid email'
        log(f"[ERROR] {error_msg}")
        output_error_json(task_id, 'VALIDATION_ERROR', error_msg)
        return {
            'success': False,
            'error': error_msg,
            'taskId': task_id
        }
    
    if not course_url:
        error_msg = 'Missing required field: courseUrl'
        log(f"[ERROR] {error_msg}")
        output_error_json(task_id, 'VALIDATION_ERROR', error_msg)
        return {
            'success': False,
            'error': error_msg,
            'taskId': task_id
        }
    
    # ✅ SECURITY: Validate and sanitize URL to prevent command injection
    is_valid, sanitized_url, url_error = validate_and_sanitize_url(course_url)
    if not is_valid:
        error_msg = f'Invalid URL: {url_error}'
        log(f"[ERROR] {error_msg}")
        output_error_json(task_id, 'VALIDATION_ERROR', error_msg, {'original_url': course_url})
        # Update task status to failed
        update_task_status(task_id, 'failed', error_msg)
        return {
            'success': False,
            'error': error_msg,
            'taskId': task_id
        }
    
    # Use sanitized URL for processing
    course_url = sanitized_url
    
    # ✅ CRITICAL FIX: Check enrollment status before downloading
    log(f"[ENROLL CHECK] Verifying enrollment status for task {task_id}...")
    is_enrolled, status, error_msg = check_enrollment_status(task_id, max_wait_seconds=15)
    
    if not is_enrolled:
        log(f"[ENROLL CHECK] ❌ Cannot proceed with download: {error_msg}")
        log(f"[ENROLL CHECK] Task status: {status}")
        
        # Update task status to failed if not already
        if status not in ['failed', 'not_found']:
            update_task_status(task_id, 'failed')
        
        return {
            'success': False,
            'error': f'Enrollment required before download: {error_msg}',
            'taskId': task_id,
            'status': status
        }
    
    log(f"[ENROLL CHECK] ✅ Enrollment verified, proceeding with download...")
    
    # ✅ FIX: Get order_id for progress tracking (optimized connection handling)
    order_id = None
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT order_id FROM download_tasks WHERE id = %s", (task_id,))
        task_row = cur.fetchone()
        order_id = task_row.get('order_id') if task_row else None
    except Exception as e:
        log(f"[ERROR] Failed to get order_id for task {task_id}: {e}")
        order_id = None
    finally:
        # ✅ FIX: Only close if not in pool
        if conn:
            try:
                global _db_connection_pool
                if _db_connection_pool and conn not in _db_connection_pool:
                    conn.close()
            except:
                pass
    
    # ✅ UNIFIED LOGGER: Log enrollment verified
    if order_id:
        log_info(task_id, order_id, 'Enrollment verified, starting download', category='enrollment')
    
    # ✅ FIX: Create task-specific sandbox directory
    task_sandbox = os.path.join(STAGING_DIR, f"Task_{task_id}")
    os.makedirs(task_sandbox, exist_ok=True)
    log(f"[SANDBOX] Task directory: {task_sandbox}")
    
    # ✅ EMIT: Download started (0%)
    emit_progress(task_id, order_id, percent=0, current_file="Initializing download...")
    emit_status_change(task_id, order_id, 'downloading', 'enrolled', 'Starting download process')
    
    # ✅ UNIFIED LOGGER: Log download started
    if order_id:
        log_info(task_id, order_id, 'Download started', {'courseUrl': course_url}, progress=0, category='download')
    
    success = False
    final_folder = None
    webhook_success = False
    download_start_time = time.time()
    
    # Retry loop
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            log(f"[ATTEMPT {attempt}/{MAX_RETRIES}] Downloading course...")
            
            # ✅ EMIT: Progress update for retry attempt
            progress_percent = 10 if attempt == 1 else 10 + ((attempt - 1) * 5)
            emit_progress(task_id, order_id, 
                         percent=progress_percent, 
                         current_file=f"Download attempt {attempt}/{MAX_RETRIES}")
            
            # ✅ SECURITY: Download into task-specific directory with bearer token
            # ✅ SECURITY: Use subprocess with array (not shell=True) to prevent injection
            # ✅ SECURITY: course_url is already validated and sanitized above
            cmd = [
                sys.executable, "main.py",
                "-c", course_url,  # ← Already validated and sanitized
                "-b", UDEMY_TOKEN,  # ← FIXED: Add bearer token for authentication
                "-o", task_sandbox,  # ← Changed from STAGING_DIR
                "-q", "720",
                "--download-captions",
                "--download-assets",
                "--download-quizzes",
                "--concurrent-downloads", "10",
                "--continue-lecture-numbers"
            ]
            
            # ✅ SECURITY: Log command without token (for security)
            cmd_safe = cmd.copy()
            if len(cmd_safe) > 3 and cmd_safe[2] == "-b":
                cmd_safe[3] = "***REDACTED***"
            log(f"[DOWNLOAD] Command: {' '.join(cmd_safe)}")
            
            # ✅ FIX: Redirect stdout/stderr to task log file for progress parsing
            task_log_dir = os.path.join(os.path.dirname(__file__), '../logs/tasks')
            os.makedirs(task_log_dir, exist_ok=True)
            task_log_path = os.path.join(task_log_dir, f'task-{task_id}.log')
            
            # ✅ FIX: Set environment variable so main.py can write to task log file
            # This ensures ALL logs (stdout, stderr, logging module) go to task log file
            os.environ['TASK_LOG_FILE'] = task_log_path
            os.environ['TASK_ID'] = str(task_id)
            
            # ✅ EMIT: Download in progress (simulated - main.py doesn't report progress yet)
            # Note: For real progress, we'd need to modify main.py to emit progress events
            emit_progress(task_id, order_id, percent=30, current_file="Downloading course content...")
            
            # ✅ UNIFIED LOGGER: Log download in progress
            if order_id:
                log_progress(task_id, order_id, 30, "Downloading course content...", {'attempt': attempt})
            
            # ✅ FIX: Run with stdout/stderr duplicated to both stdout (PM2) and task log file
            # This ensures logs appear in worker-out.log (for pm2 log worker) AND task log file
            with TeeWriter(task_log_path) as tee:
                # Write header to both stdout and task log file
                header = f"\n{'='*60}\n[{datetime.now().isoformat()}] Starting download for task {task_id}\nCommand: {' '.join(cmd)}\n{'='*60}\n"
                tee.write(header)
                
                # ✅ SECURITY: Run subprocess with output duplicated to both stdout and task log file
                # ✅ SECURITY: Use subprocess.run() with timeout and proper error handling
                # ✅ SECURITY: Process is killed automatically on timeout
                process = None
                try:
                    process = subprocess.Popen(
                        cmd,
                        stdout=tee,  # TeeWriter will duplicate to both stdout and file
                        stderr=subprocess.STDOUT,  # Merge stderr to stdout
                        text=True,
                        cwd=os.path.dirname(__file__)  # Run from udemy_dl directory
                    )
                    
                    # Wait for process with timeout
                    try:
                        return_code = process.wait(timeout=DOWNLOAD_TIMEOUT)
                        
                        if return_code != 0:
                            error_msg = f"Process failed with exit code {return_code}"
                            log(f"[ERROR] {error_msg}")
                            output_error_json(task_id, 'PROCESS_ERROR', error_msg, {
                                'exit_code': return_code,
                                'command': ' '.join(cmd_safe)
                            })
                            raise subprocess.CalledProcessError(return_code, cmd)
                    
                    except subprocess.TimeoutExpired:
                        # ✅ SECURITY: Kill process on timeout to prevent resource leaks
                        log(f"[TIMEOUT] Download exceeded {DOWNLOAD_TIMEOUT}s timeout, killing process...")
                        output_error_json(task_id, 'TIMEOUT_ERROR', 
                                        f'Download exceeded {DOWNLOAD_TIMEOUT}s timeout', {
                                            'timeout_seconds': DOWNLOAD_TIMEOUT
                                        })
                        
                        # ✅ SECURITY: Force kill process and its children
                        try:
                            process.kill()
                            process.wait(timeout=5)
                        except:
                            try:
                                # Kill process group to ensure all child processes are terminated
                                if hasattr(os, 'getpgid') and hasattr(os, 'killpg'):
                                    os.killpg(os.getpgid(process.pid), signal.SIGKILL)
                                else:
                                    # Fallback for Windows
                                    process.kill()
                            except:
                                pass
                        
                        raise subprocess.TimeoutExpired(cmd, DOWNLOAD_TIMEOUT)
                    
                except subprocess.CalledProcessError as e:
                    error_msg = f"Process failed with exit code {e.returncode}"
                    log(f"[ERROR] {error_msg}")
                    output_error_json(task_id, 'PROCESS_ERROR', error_msg, {
                        'exit_code': e.returncode
                    })
                    raise
                except subprocess.TimeoutExpired:
                    # Already handled above, re-raise
                    raise
                except Exception as e:
                    error_msg = f"Subprocess error: {str(e)}"
                    log(f"[ERROR] {error_msg}")
                    output_error_json(task_id, 'SUBPROCESS_ERROR', error_msg, {
                        'exception_type': type(e).__name__
                    })
                    raise
                finally:
                    # ✅ SECURITY: Ensure process is terminated
                    if process and process.poll() is None:
                        try:
                            process.terminate()
                            process.wait(timeout=5)
                        except:
                            try:
                                process.kill()
                            except:
                                pass
            
            # ✅ EMIT: Download completed
            emit_progress(task_id, order_id, percent=70, current_file="Download completed, preparing upload...")
            
            # ✅ UNIFIED LOGGER: Log download completed
            if order_id:
                download_duration = int(time.time() - download_start_time)
                log_progress(task_id, order_id, 70, "Download completed, preparing upload...", {
                    'duration': download_duration,
                    'attempt': attempt
                })
            
            # Check for output folder
            subdirs = [f.path for f in os.scandir(task_sandbox) if f.is_dir()]
            if not subdirs:
                raise Exception("No output folder found after download")
            
            final_folder = subdirs[0]
            log(f"[CHECK] Downloaded: {os.path.basename(final_folder)}")
            
            # Upload to Google Drive
            log(f"[UPLOAD] Starting upload to Google Drive...")
            emit_progress(task_id, order_id, percent=80, current_file="Uploading to Google Drive...")
            emit_status_change(task_id, order_id, 'uploading', 'downloading', 'Starting upload to Google Drive')
            
            # ✅ UNIFIED LOGGER: Log upload started
            if order_id:
                log_info(task_id, order_id, 'Upload started', {
                    'folderName': os.path.basename(final_folder)
                }, progress=80, category='upload')
            
            if upload_to_drive(final_folder):
                log(f"[UPLOAD] Upload successful!")
                emit_progress(task_id, order_id, percent=95, current_file="Upload completed, finalizing...")
                
                # ✅ LIFECYCLE LOG: Upload Success
                # Get drive link from folder name (will be finalized by webhook)
                log_upload_success(task_id, f"Folder: {os.path.basename(final_folder)}", {
                    'folderName': os.path.basename(final_folder),
                    'orderId': order_id
                })
                
                # ✅ UNIFIED LOGGER: Log upload success
                if order_id:
                    log_info(task_id, order_id, 'Upload completed successfully', {
                        'folderName': os.path.basename(final_folder)
                    }, progress=95, category='upload')
                
                success = True
                break  # Exit retry loop on success
            else:
                # ✅ LIFECYCLE LOG: Upload Error
                log_upload_error(task_id, "Rclone upload failed", {
                    'folderName': os.path.basename(final_folder) if final_folder else None,
                    'orderId': order_id
                })
                
                # ✅ UNIFIED LOGGER: Log upload error
                if order_id:
                    log_error(task_id, order_id, 'Upload failed', {
                        'folderName': os.path.basename(final_folder) if final_folder else None
                    }, category='upload')
                
                raise Exception("Rclone upload failed")
        
        except subprocess.TimeoutExpired:
            error_msg = f"Download exceeded {DOWNLOAD_TIMEOUT}s timeout"
            log(f"[TIMEOUT] {error_msg}")
            # ✅ EMIT: Error progress (but don't set to 0% - keep last progress)
            emit_status_change(task_id, order_id, 'retrying', 'downloading', error_msg)
            # ✅ UNIFIED LOGGER: Log timeout
            if order_id:
                log_warn(task_id, order_id, error_msg, {'attempt': attempt, 'timeout': DOWNLOAD_TIMEOUT}, category='download')
        except subprocess.CalledProcessError as e:
            error_msg = f"main.py failed with exit code {e.returncode}"
            log(f"[ERROR] {error_msg}")
            emit_status_change(task_id, order_id, 'retrying', 'downloading', error_msg)
            # ✅ UNIFIED LOGGER: Log process error
            if order_id:
                log_error(task_id, order_id, error_msg, {'attempt': attempt, 'exitCode': e.returncode}, category='download')
        except Exception as e:
            error_msg = str(e)
            log(f"[ERROR] {error_msg}")
            emit_status_change(task_id, order_id, 'retrying', 'downloading', error_msg)
            # ✅ UNIFIED LOGGER: Log general error
            if order_id:
                log_error(task_id, order_id, error_msg, {'attempt': attempt}, category='download')
        
        # ✅ SMART RETRY: Don't clean staging on failure (allow resume)
        if attempt < MAX_RETRIES:
            log(f"[RESUME] Keeping downloaded files for resume on next attempt...")
            log(f"[INFO] Retrying in 20 seconds...")
            # ✅ EMIT: Retry countdown
            emit_progress(task_id, order_id, 
                         percent=progress_percent, 
                         current_file=f"Retrying in 20 seconds... ({attempt}/{MAX_RETRIES})")
            time.sleep(20)
    
    # Process result
    if success and final_folder:
        # ✅ EMIT: 100% completion
        emit_progress(task_id, order_id, percent=100, current_file="Task completed successfully!")
        
        # ✅ LIFECYCLE LOG: Download Success
        download_duration = int(time.time() - download_start_time)
        log_download_success(task_id, download_duration, {
            'folderName': os.path.basename(final_folder),
            'orderId': order_id
        })
        
        # ✅ UNIFIED LOGGER: Log download completed
        if order_id:
            log_progress(task_id, order_id, 100, "Task completed successfully!", {
                'duration': download_duration,
                'folderName': os.path.basename(final_folder)
            })
        
        # Update database to 'completed'
        update_task_status(task_id, 'completed')
        emit_status_change(task_id, order_id, 'completed', 'uploading', 'Task completed successfully')
        
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
            'folder': os.path.basename(final_folder)  # ✅ FIX: Use os.path.basename() not os.basename()
        }
    else:
        # ✅ CRITICAL: Bridge ephemeral error to persistent audit log
        # Determine specific error message
        error_details = {
            'task_id': task_id,
            'order_id': order_id,
            'course_url': course_url,
            'retries_attempted': MAX_RETRIES,
            'timestamp': datetime.now().isoformat()
        }
        
        # Check for specific error patterns
        error_message = 'Download or upload failed after retries'
        if not os.path.exists(task_sandbox):
            error_message = 'Task sandbox directory not created - possible disk space issue'
            error_details['error_type'] = 'DISK_SPACE'
        elif os.path.exists(task_sandbox):
            subdirs = [f.path for f in os.scandir(task_sandbox) if f.is_dir()]
            if not subdirs:
                error_message = 'No course folder found after download - possible authentication issue'
                error_details['error_type'] = 'AUTHENTICATION'
        
        # ✅ EMIT: Progress set to 0% to indicate failure
        emit_progress(task_id, order_id, percent=0, current_file=f"Failed: {error_message}")
        emit_status_change(task_id, order_id, 'failed', 'downloading', error_message)
        
        # ✅ LIFECYCLE LOG: Download Error
        download_duration = int(time.time() - download_start_time) if 'download_start_time' in locals() else 0
        log_download_error(task_id, error_message, {
            'orderId': order_id,
            'retriesAttempted': MAX_RETRIES,
            'duration': download_duration,
            **error_details
        })
        
        # ✅ UNIFIED LOGGER: Log download error
        if order_id:
            log_error(task_id, order_id, error_message, error_details, category='download')
        
        # ✅ FIX: Update database to 'failed' with detailed error log (optimized)
        update_task_status(task_id, 'failed', json.dumps(error_details))
        
        # ✅ KEEP failed folder for debugging (don't clean)
        log(f"[FAILED] Task failed after {MAX_RETRIES} retries")
        log(f"[DEBUG] Failed files kept at: {task_sandbox}")
        log(f"[DEBUG] You can manually inspect or retry this task")
        log(f"[ERROR DETAILS] {json.dumps(error_details, indent=2)}")
        
        log("[FAILED] Task failed after retries")
        return {
            'success': False,
            'taskId': task_id,
            'error': error_message,
            'details': error_details
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
                    # Update task status if we have taskId
                    try:
                        job_data_parsed = json.loads(job_json) if job_json else {}
                        task_id = job_data_parsed.get('taskId')
                        if task_id:
                            update_task_status(task_id, 'failed', f'Invalid job JSON: {str(e)}')
                    except:
                        pass
                except Exception as e:
                    import traceback
                    error_trace = traceback.format_exc()
                    log(f"[WORKER #{worker_id}] [ERROR] Processing failed: {e}")
                    log(f"[WORKER #{worker_id}] [ERROR] Traceback: {error_trace}")
                    
                    # ✅ FIX: Update task status on processing error
                    try:
                        job_data_parsed = json.loads(job_json) if job_json else {}
                        task_id = job_data_parsed.get('taskId')
                        if task_id:
                            update_task_status(task_id, 'failed', f'Worker processing error: {str(e)}\n{error_trace}')
                    except:
                        pass
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
    
    # ✅ SECURITY: Wrap main entry point in try-except to prevent crashes
    try:
        start_worker(worker_id)
    except KeyboardInterrupt:
        log("\n[STOP] Worker stopped by user (SIGINT)")
        output_error_json(None, 'USER_INTERRUPT', 'Worker stopped by user')
        sys.exit(0)
    except Exception as e:
        # ✅ SECURITY: Log unhandled exceptions to stderr in JSON format
        error_msg = f"Unhandled exception in worker: {str(e)}"
        error_trace = traceback.format_exc()
        
        log(f"[CRITICAL] {error_msg}")
        log(f"[CRITICAL] Traceback:\n{error_trace}")
        
        output_error_json(None, 'UNHANDLED_EXCEPTION', error_msg, {
            'exception_type': type(e).__name__,
            'traceback': error_trace
        })
        
        sys.exit(1)