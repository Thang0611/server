# # import mysql.connector
# # import subprocess
# # import os
# # import time
# # import shutil
# # import sys
# # from datetime import datetime
# # from dotenv import load_dotenv
# # import requests

# # # ================= 1. LOAD CONFIGURATION =================
# # # Load .env từ thư mục cha hoặc thư mục hiện tại
# # env_path = os.path.join(os.path.dirname(__file__), './../.env')
# # if not os.path.exists(env_path):
# #     env_path = os.path.join(os.path.dirname(__file__), './.env')

# # load_dotenv(dotenv_path=env_path)

# # # Hàm log có timestamp
# # def log(msg):
# #     print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}")

# # # Validate biến môi trường quan trọng
# # REQUIRED_VARS = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'UDEMY_TOKEN']
# # missing_vars = [var for var in REQUIRED_VARS if not os.getenv(var)]
# # if missing_vars:
# #     log(f"[CRITICAL] Thiếu biến môi trường: {', '.join(missing_vars)}")
# #     log("Vui lòng kiểm tra file .env")
# #     sys.exit(1)

# # # Cấu hình Database
# # DB_CONFIG = {
# #     'user': os.getenv('DB_USER'),
# #     'password': os.getenv('DB_PASSWORD'),
# #     'host': os.getenv('DB_HOST'),
# #     'database': os.getenv('DB_NAME'),
# #     'raise_on_warnings': True,
# #     'connection_timeout': 300 # Tăng timeout kết nối
# # }

# # # Cấu hình Download
# # UDEMY_TOKEN = os.getenv('UDEMY_TOKEN')
# # BROWSER = "chrome"
# # RCLONE_REMOTE = "gdrive"
# # RCLONE_DEST_PATH = "UdemyCourses/download_khoahoc"
# # STAGING_DIR = "Staging_Download"
# # MAX_RETRIES = 3
# # RETRY_DELAY = 20
# # TIMEOUT_SECONDS = 144000  # ~16 ngày (đủ cho file siêu lớn)
# # CHECK_INTERVAL = 60        # 10 giây quét 1 lần

# # # ================= 2. HELPER FUNCTIONS =================

# # def get_db_connection():
# #     """Tạo kết nối mới tới MySQL"""
# #     return mysql.connector.connect(**DB_CONFIG)

# # def get_downloaded_course_folder():
# #     """Tìm folder kết quả sau khi download"""
# #     if not os.path.exists(STAGING_DIR):
# #         return None
# #     subdirs = [f.path for f in os.scandir(STAGING_DIR) if f.is_dir()]
# #     if subdirs:
# #         return subdirs[0]
# #     return None

# # def clean_staging():
# #     """Dọn dẹp thư mục tạm"""
# #     if os.path.exists(STAGING_DIR):
# #         try:
# #             shutil.rmtree(STAGING_DIR)
# #         except Exception as e:
# #             log(f"[WARN] Không thể xóa thư mục tạm: {e}")
# #     os.makedirs(STAGING_DIR, exist_ok=True)

# # def save_error_evidence(url):
# #     """Lưu lại folder lỗi để debug"""
# #     if os.path.exists(STAGING_DIR) and os.listdir(STAGING_DIR):
# #         timestamp = datetime.now().strftime("%H%M%S")
# #         try:
# #             slug = url.strip('/').split('/')[-1]
# #         except:
# #             slug = "unknown_course"
        
# #         error_path = f"FAILED_{slug}_{timestamp}"
# #         try:
# #             os.rename(STAGING_DIR, error_path)
# #             log(f"[KEEP] Đã giữ lại file lỗi tại: {error_path}")
# #             os.makedirs(STAGING_DIR, exist_ok=True)
# #         except Exception as e:
# #             log(f"[ERR] Không thể lưu file lỗi: {e}")

# # def upload_to_drive(local_path):
# #     """Upload folder lên Google Drive qua Rclone"""
# #     folder_name = os.path.basename(local_path)
# #     remote_path = f"{RCLONE_REMOTE}:{RCLONE_DEST_PATH}/{folder_name}"
    
# #     log(f"[RCLONE] >>> BẮT ĐẦU UPLOAD: '{folder_name}'")
    
# #     cmd = [
# #         "rclone", "move", local_path, remote_path,
# #         "-P", "--transfers=8", "--checkers=16"
# #     ]
# #     try:
# #         subprocess.run(cmd, check=True)
# #         log("[RCLONE] Upload thành công!")
# #         return True
# #     except subprocess.CalledProcessError:
# #         log("[RCLONE] Upload thất bại!")
# #         return False

# # # ================= 3. DATABASE INTERACTION =================

# # def get_enrolled_task():
# #     """Lấy 1 task đang 'enrolled' cũ nhất"""
# #     conn = None
# #     cursor = None
# #     try:
# #         conn = get_db_connection()
# #         cursor = conn.cursor(dictionary=True)
        
# #         # [FIX QUAN TRỌNG] Đổi created_at -> createdAt
# #         query_select = "SELECT id, course_url, email FROM downloads WHERE status = 'enrolled' ORDER BY createdAt ASC LIMIT 1"
# #         cursor.execute(query_select)
# #         task = cursor.fetchone()
        
# #         if task:
# #             # [FIX QUAN TRỌNG] Đổi updated_at -> updatedAt
# #             query_update = "UPDATE downloads SET status = 'downloading', updatedAt = NOW() WHERE id = %s"
# #             cursor.execute(query_update, (task['id'],))
# #             conn.commit()
# #             return task
# #         return None
# #     except mysql.connector.Error as err:
# #         log(f"[DB ERROR] Lỗi MySQL: {err}")
# #         return None
# #     except Exception as e:
# #         log(f"[DB ERROR] Lỗi hệ thống: {e}")
# #         return None
# #     finally:
# #         if cursor: cursor.close()
# #         if conn: conn.close()


# # def reset_zombie_tasks():
# #     """Reset các task đang treo 'downloading' về 'enrolled' để tải lại"""
# #     conn = None
# #     cursor = None
# #     try:
# #         conn = get_db_connection()
# #         cursor = conn.cursor()
        
# #         # Tìm các task đang downloading
# #         # (Lý tưởng là chỉ reset những task update quá lâu, nhưng đơn giản thì reset hết khi khởi động)
# #         query = "UPDATE downloads SET status = 'enrolled' WHERE status = 'downloading'"
# #         cursor.execute(query)
# #         conn.commit()
        
# #         if cursor.rowcount > 0:
# #             log(f"[SYSTEM] Đã tìm thấy {cursor.rowcount} task bị treo (Zombie). Đã reset về 'enrolled'.")
# #         else:
# #             log("[SYSTEM] Không có task nào bị treo.")
            
# #     except Exception as e:
# #         log(f"[DB ERROR] Lỗi khi reset task: {e}")
# #     finally:
# #         if cursor: cursor.close()
# #         if conn: conn.close()


# # def update_task_status(task_id, status):
# #     """Cập nhật trạng thái completed/failed"""
# #     conn = None
# #     cursor = None
# #     try:
# #         conn = get_db_connection()
# #         cursor = conn.cursor()
# #         # [FIX QUAN TRỌNG] Đổi updated_at -> updatedAt
# #         query = "UPDATE downloads SET status = %s, updatedAt = NOW() WHERE id = %s"
# #         cursor.execute(query, (status, task_id))
# #         conn.commit()
# #         log(f"[DB] Task {task_id} -> {status}")
# #     except Exception as e:
# #         log(f"[DB ERROR] Không thể update status task {task_id}: {e}")
# #     finally:
# #         if cursor: cursor.close()
# #         if conn: conn.close()

# # # ================= 4. MAIN LOOP =================

# # def main():
# #     log(">>> WORKER PRODUCTION STARTED (MySQL + Python Env) <<<")
# #     clean_staging() 
# #     reset_zombie_tasks()
# #     while True:
# #         try:
# #             task = get_enrolled_task()
# #         except Exception as e:
# #             log(f"[CRITICAL] Lỗi kết nối DB trong vòng lặp chính: {e}")
# #             time.sleep(30)
# #             continue

# #         if not task:
# #             # Không có việc thì nghỉ
# #             time.sleep(CHECK_INTERVAL)
# #             continue

# #         url = task['course_url']
# #         task_id = task['id']
        
# #         log("="*60)
# #         log(f"[*] NHẬN TASK ID: {task_id}")
# #         log(f"[*] URL: {url}")

# #         success = False
        
# #         # === VÒNG LẶP RETRY ===
# #         for attempt in range(1, MAX_RETRIES + 1):
# #             try:
# #                 log(f"[ATTEMPT {attempt}/{MAX_RETRIES}] Đang tải về máy...")
                
# #                 # [FIX] Sử dụng sys.executable để đảm bảo dùng đúng Python của venv
# #                 cmd = [
# #                     sys.executable, "main.py",
# #                     "-c", url, 
# #                     "-b", UDEMY_TOKEN,
# #                     "--browser", BROWSER,
# #                     "-o", STAGING_DIR, "-q", "720",
# #                     "--download-captions", "--download-assets", "--download-quizzes",
# #                     "--concurrent-downloads", "10", "-l", "all", "--continue-lecture-numbers"
# #                 ]

# #                 # Chạy lệnh download
# #                 subprocess.run(cmd, check=True, timeout=TIMEOUT_SECONDS)
                
# #                 course_folder = get_downloaded_course_folder()
                
# #                 if course_folder:
# #                     log(f"[CHECK] Đã tải xong: {os.path.basename(course_folder)}")
                    
# #                     if upload_to_drive(course_folder):
# #                         success = True
# #                         break # Upload xong thì thoát vòng lặp retry
# #                     else:
# #                         raise Exception("Lỗi Rclone Upload")
# #                 else:
# #                     raise Exception("Folder kết quả rỗng (Download thất bại)")

# #             except subprocess.TimeoutExpired:
# #                 log(f"[TIMEOUT] Quá thời gian {TIMEOUT_SECONDS}s.")
# #             except subprocess.CalledProcessError as e:
# #                 log(f"[ERROR] Tool main.py trả về lỗi (Exit code: {e.returncode})")
# #             except Exception as e:
# #                 log(f"[ERROR] Ngoại lệ: {e}")

# #             # Nếu chưa thành công và còn lượt thử
# #             if attempt < MAX_RETRIES and not success:
# #                 log(f"[INFO] Thử lại sau {RETRY_DELAY}s...")
# #                 time.sleep(RETRY_DELAY)

# #         if success:
# #             # update_task_status(task_id, 'completed') <--- Bỏ dòng này update DB ở đây cũng được, hoặc để API làm
# #             # Nhưng tốt nhất Python cứ update DB trước cho chắc
# #             update_task_status(task_id, 'completed')
# #             clean_staging()
            
# #             # ---> THÊM DÒNG NÀY <---
# #             # Gọi API để Node.js cấp quyền và gửi mail
# #             notify_server_completion(task_id, course_folder) 
            
# #         else:
# #             update_task_status(task_id, 'failed')
# #             save_error_evidence(url)
# #             log("[FAILED] Task thất bại sau nhiều lần thử.")

# #         log("="*60)
# #         time.sleep(5) 

# # def notify_server_completion(task_id, folder_name_local):
# #     """Gọi API Node.js để báo cáo hoàn tất"""
# #     api_url = "https://api.khoahocgiare.info/api/v1/webhook/finalize"
    
# #     # Secret key phải khớp với file .env của Node.js
# #     secret = os.getenv('API_SECRET_KEY') or "KEY_BAO_MAT_CUA_BAN_2025" 
    
# #     # Lấy tên folder (bỏ đường dẫn đầy đủ, chỉ lấy tên cuối)
# #     folder_name_only = os.path.basename(folder_name_local)

# #     payload = {
# #         "secret_key": secret,
# #         "task_id": task_id,
# #         "folder_name": folder_name_only
# #     }
# #     console.log(payload)
# #     try:
# #         log(f"[API] Đang gọi Webhook để cấp quyền Drive cho folder: {folder_name_only}...")
# #         res = requests.post(api_url, json=payload)
# #         if res.status_code == 200:
# #             log("[API] Server Node.js đã xác nhận: Cấp quyền & Gửi mail OK.")
# #         else:
# #             log(f"[API WARN] Server trả về lỗi: {res.text}")
# #     except Exception as e:
# #         log(f"[API ERR] Không gọi được API: {e}")


# # if __name__ == "__main__":
# #     try:
# #         main()
# #     except KeyboardInterrupt:
# #         print("\n[STOP] Đã dừng Worker an toàn.")

# import mysql.connector
# import subprocess
# import os
# import time
# import shutil
# import sys
# from datetime import datetime
# from dotenv import load_dotenv
# import requests
# import hmac
# import hashlib

# # ================= 1. SETUP =================
# # Load .env
# env_paths = [os.path.join(os.path.dirname(__file__), './../.env'), 
#              os.path.join(os.path.dirname(__file__), './.env')]
# env_path = next((p for p in env_paths if os.path.exists(p)), None)
# load_dotenv(dotenv_path=env_path)

# def log(msg):
#     print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}")

# # Check Env
# REQUIRED = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'UDEMY_TOKEN']
# if any(not os.getenv(v) for v in REQUIRED):
#     log("[CRITICAL] Thiếu biến môi trường .env")
#     sys.exit(1)

# DB_CONFIG = {
#     'user': os.getenv('DB_USER'),
#     'password': os.getenv('DB_PASSWORD'),
#     'host': os.getenv('DB_HOST'),
#     'database': os.getenv('DB_NAME'),
#     'connection_timeout': 300,
#     'autocommit': True
# }

# UDEMY_TOKEN = os.getenv('UDEMY_TOKEN')
# STAGING_DIR = "Staging_Download"
# RCLONE_REMOTE = "gdrive"
# RCLONE_DEST_PATH = "UdemyCourses/download_khoahoc"
# MAX_RETRIES = 3

# # ================= 2. FUNCTIONS =================

# def get_db_connection():
#     return mysql.connector.connect(**DB_CONFIG)

# def clean_staging():
#     if os.path.exists(STAGING_DIR):
#         try: shutil.rmtree(STAGING_DIR)
#         except: pass
#     os.makedirs(STAGING_DIR, exist_ok=True)

# def get_task():
#     conn = None
#     try:
#         conn = get_db_connection()
#         cur = conn.cursor(dictionary=True)
#         # Transaction để tránh race condition
#         conn.start_transaction()
#         cur.execute("SELECT id, course_url, email FROM download_tasks WHERE status = 'enrolled' ORDER BY created_at ASC LIMIT 1 FOR UPDATE")
#         task = cur.fetchone()
        
#         if task:
#             cur.execute("UPDATE download_tasks SET status = 'processing', updated_at = NOW() WHERE id = %s", (task['id'],))
#             conn.commit()
#             return task
#         else:
#             conn.rollback()
#             return None
#     except Exception as e:
#         log(f"[DB ERR] Get Task: {e}")
#         if conn: conn.rollback()
#         return None
#     finally:
#         if conn: conn.close()

# def upload_to_drive(local_path):
#     folder_name = os.path.basename(local_path)
#     remote_path = f"{RCLONE_REMOTE}:{RCLONE_DEST_PATH}/{folder_name}"
    
#     log(f"[RCLONE] Start Upload: {folder_name}")
#     cmd = ["rclone", "move", local_path, remote_path, "-P", "--transfers=8", "--checkers=16"]
    
#     try:
#         subprocess.run(cmd, check=True)
#         log("[RCLONE] Upload OK")
#         return True
#     except subprocess.CalledProcessError:
#         log("[RCLONE] Upload Fail")
#         return False

# def notify_node_webhook(task_id, folder_name_local):
#     """
#     Gọi Node.js để update DB (driver_url) và gửi mail
#     ✅ SECURITY: Sử dụng HMAC-SHA256 để xác thực webhook
#     """
#     api_url = "https://api.khoahocgiare.info/api/v1/webhook/finalize"
#     secret = os.getenv('API_SECRET_KEY') or "KEY_BAO_MAT_CUA_BAN_2025"
#     folder_name_only = os.path.basename(folder_name_local)
    
#     # Tạo timestamp (Unix timestamp dạng string)
#     timestamp = str(int(time.time()))
    
#     # Payload gửi đi
#     payload = {
#         "task_id": task_id,
#         "folder_name": folder_name_only,
#         "timestamp": timestamp
#     }
    
#     # Tạo HMAC-SHA256 signature
#     # Message = task_id + folder_name + timestamp
#     message = f"{task_id}{folder_name_only}{timestamp}"
#     signature = hmac.new(
#         secret.encode('utf-8'),
#         message.encode('utf-8'),
#         hashlib.sha256
#     ).hexdigest()
    
#     # Headers với signature và timestamp
#     headers = {
#         "Content-Type": "application/json",
#         "X-Signature": signature,
#         "X-Timestamp": timestamp
#     }
    
#     try:
#         log(f"[API] Calling webhook with HMAC auth: {folder_name_only}")
#         res = requests.post(api_url, json=payload, headers=headers, timeout=30)
#         if res.status_code == 200:
#             log(f"[API] Success Webhook: {folder_name_only}")
#         else:
#             log(f"[API FAIL] Code: {res.status_code} - {res.text}")
#     except Exception as e:
#         log(f"[API ERR] {e}")

# def update_status(task_id, status):
#     conn = get_db_connection()
#     try:
#         cur = conn.cursor()
#         cur.execute("UPDATE download_tasks SET status = %s, updated_at = NOW() WHERE id = %s", (status, task_id))
#         conn.commit()
#     finally:
#         conn.close()

# # ================= 3. MAIN =================

# def main():
#     log(">>> PYTHON WORKER STARTED <<<")
#     clean_staging()
    
#     # Reset Zombie - Reset tasks stuck in 'processing' back to 'enrolled'
#     try:
#         c = get_db_connection()
#         cur = c.cursor()
#         cur.execute("UPDATE download_tasks SET status = 'enrolled' WHERE status = 'processing'")
#         c.close()
#     except: pass

#     while True:
#         task = get_task()
#         if not task:
#             time.sleep(10)
#             continue

#         log(f"="*50)
#         log(f"[*] TASK ID: {task['id']} | URL: {task['course_url']}")
        
#         success = False
#         final_folder = None

#         for attempt in range(1, MAX_RETRIES + 1):
#             try:
#                 log(f"[ATTEMPT {attempt}] Downloading...")
#                 # ✅ SECURITY FIX: Không truyền UDEMY_TOKEN qua CLI argument
#                 # Token sẽ được đọc từ environment variable trong main.py
#                 cmd = [
#                     sys.executable, "main.py",
#                     "-c", task['course_url'],
#                     "-o", STAGING_DIR,
#                     "-q", "720", "--download-captions", "--download-assets", "--download-quizzes",
#                     "--concurrent-downloads", "10", "--continue-lecture-numbers"
#                 ]
#                 subprocess.run(cmd, check=True, timeout=144000)

#                 # Check Output
#                 subdirs = [f.path for f in os.scandir(STAGING_DIR) if f.is_dir()]
#                 if not subdirs: raise Exception("No output folder found")
                
#                 final_folder = subdirs[0]
                
#                 # Upload
#                 if upload_to_drive(final_folder):
#                     success = True
#                     break
#                 else:
#                     raise Exception("Upload failed")

#             except Exception as e:
#                 log(f"[ERR] {e}")
#                 clean_staging()
#                 time.sleep(20)

#         if success and final_folder:
#             # Update DB sang completed trước
#             update_status(task['id'], 'completed')
#             # Gọi Webhook để điền thông tin driver_url và gửi mail
#             notify_node_webhook(task['id'], final_folder)
#             clean_staging()
#             log("[SUCCESS] Task done.")
#         else:
#             update_status(task['id'], 'failed')
#             log("[FAILED] Task aborted.")
#             clean_staging()

# if __name__ == "__main__":
#     try:
#         main()
#     except KeyboardInterrupt:
#         print("Worker Stopped.")