import subprocess
import os
import time
import shutil
from datetime import datetime

# ================= CẤU HÌNH (SỬA Ở ĐÂY) =================
UDEMY_TOKEN = "CJzxyfSe4NCQykLKPfQ8Wzrae21ArbH10UDB9W1u"
BROWSER = "chrome"
RCLONE_REMOTE = "gdrive"        
RCLONE_DEST_PATH = "UdemyCourses/web-development" 
LIST_FILE = "courses.txt"           
HISTORY_FILE = "downloaded_history.txt" 
STAGING_DIR = "Staging_Download"    
MAX_RETRIES = 3       # Tăng lên 3 lần thử để chắc ăn hơn với lỗi 504
RETRY_DELAY = 20      # Tăng thời gian nghỉ lên 20s để server Udemy ổn định lại
TIMEOUT_SECONDS = 1440000 
CHECK_INTERVAL = 300 
# =========================================================

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def get_downloaded_course_folder():
    if not os.path.exists(STAGING_DIR):
        return None
    subdirs = [f.path for f in os.scandir(STAGING_DIR) if f.is_dir()]
    if subdirs:
        return subdirs[0]
    return None

def clean_staging():
    """Xóa sạch thư mục tạm để chuẩn bị cho khóa mới"""
    if os.path.exists(STAGING_DIR):
        try:
            shutil.rmtree(STAGING_DIR)
        except Exception as e:
            log(f"[WARN] Không thể xóa thư mục tạm: {e}")
    os.makedirs(STAGING_DIR, exist_ok=True)

def save_error_evidence(url):
    """Đổi tên thư mục lỗi để giữ lại file không bị xóa"""
    if os.path.exists(STAGING_DIR) and os.listdir(STAGING_DIR):
        timestamp = datetime.now().strftime("%H%M%S")
        # Xử lý an toàn hơn khi split url
        try:
            slug = url.strip('/').split('/')[-1]
        except:
            slug = "unknown_course"
            
        error_path = f"FAILED_{slug}_{timestamp}"
        try:
            os.rename(STAGING_DIR, error_path)
            log(f"[KEEP] Đã giữ lại file lỗi tại thư mục: {error_path}")
            os.makedirs(STAGING_DIR, exist_ok=True)
        except Exception as e:
            log(f"[ERR] Không thể lưu file lỗi: {e}")

def upload_to_drive(local_path):
    folder_name = os.path.basename(local_path)
    remote_path = f"{RCLONE_REMOTE}:{RCLONE_DEST_PATH}/{folder_name}"
    
    log(f"[RCLONE] >>> BẮT ĐẦU UPLOAD: '{folder_name}'")
    
    cmd = [
        "rclone", "move", local_path, remote_path,
        "-P", "--transfers=8", "--checkers=16"
    ]
    try:
        subprocess.run(cmd, check=True)
        log("[RCLONE] Upload thành công!")
        return True
    except subprocess.CalledProcessError:
        log("[RCLONE] Upload thất bại!")
        return False

def get_new_courses():
    """Đọc file list và đối chiếu với history để tìm link mới"""
    if not os.path.exists(LIST_FILE):
        return []
    
    # Đọc lịch sử đã tải
    downloaded = set()
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, "r") as f:
            downloaded = {line.strip() for line in f}
            
    # Đọc danh sách hiện tại
    current_courses = []
    with open(LIST_FILE, "r", encoding="utf-8") as f:
        current_courses = [line.strip() for line in f if line.strip() and not line.startswith("#")]
    
    # Lọc ra những khóa chưa có trong history
    new_items = [url for url in current_courses if url not in downloaded]
    return new_items

def main():
    log(">>> Script đang chạy chế độ MONITOR (Quét danh sách mỗi 5 phút) <<<")
    log(f">>> Bạn có thể thêm link vào '{LIST_FILE}' bất cứ lúc nào.")

    while True:
        # 1. Tìm khóa học mới
        new_courses = get_new_courses()
        
        if not new_courses:
            log(f"[IDLE] Không có bài mới. Ngủ {CHECK_INTERVAL} giây...")
            time.sleep(CHECK_INTERVAL)
            continue 

        total = len(new_courses)
        log(f"[*] Phát hiện {total} khóa học mới cần xử lý.")

        # 2. Xử lý từng khóa mới
        for index, url in enumerate(new_courses):
            log("="*60)
            log(f"[*] Đang xử lý {index + 1}/{total}: {url}")

            # clean_staging() # Có thể uncomment nếu muốn chắc chắn sạch sẽ từ đầu
            success = False
            
            # === VÒNG LẶP RETRY ===
            for attempt in range(1, MAX_RETRIES + 1):
                try:
                    log(f"[ATTEMPT {attempt}/{MAX_RETRIES}] Đang tải về máy...")
                    
                    cmd = [
                        "python", "main.py",
                        "-c", url, 
                        "-b", UDEMY_TOKEN,
                        "--browser", BROWSER,
                        "-o", STAGING_DIR, "-q", "720",
                        "--download-captions", "--download-assets", "--download-quizzes",
                        "--concurrent-downloads", "10", "-l", "all", "--continue-lecture-numbers"
                    ]

                    subprocess.run(cmd, check=True, timeout=TIMEOUT_SECONDS)
                    
                    course_folder = get_downloaded_course_folder()
                    
                    if course_folder:
                        log(f"[CHECK] Đã tải xong: {os.path.basename(course_folder)}")
                        
                        if upload_to_drive(course_folder):
                            # Ghi vào history ngay sau khi upload xong
                            with open(HISTORY_FILE, "a") as history:
                                history.write(url + "\n")
                            success = True
                            break 
                        else:
                            raise Exception("Lỗi Rclone Upload")
                    else:
                        raise Exception("Không thấy thư mục kết quả")

                except subprocess.TimeoutExpired:
                    log(f"[TIMEOUT] Treo quá {TIMEOUT_SECONDS}s.")
                except subprocess.CalledProcessError as e:
                    # Đã sửa lỗi chính tả ở đây (eS -> e)
                    log(f"[ERROR] Lỗi tải từ main.py (Exit code: {e.returncode})")
                except Exception as e:
                    log(f"[ERROR] Lỗi ngoại lệ: {e}")

                if attempt < MAX_RETRIES:
                    log(f"[INFO] Giữ file tạm để RESUME. Nghỉ {RETRY_DELAY}s thử lại...")
                    time.sleep(RETRY_DELAY)
                else:
                    log("[FAIL] Hết số lần thử.")

            # === KẾT THÚC 1 KHÓA ===
            if success:
                clean_staging()
            else:
                save_error_evidence(url)

        log("="*60)
        log(f"[BATCH DONE] Đã xử lý xong đợt này. Đợi {CHECK_INTERVAL} giây để quét tiếp...")
        time.sleep(CHECK_INTERVAL)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[STOP] Đã dừng chương trình.")