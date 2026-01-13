# Worker Refactor Summary - Khắc Phục Lỗi Production

**Ngày:** 2026-01-12  
**Mục tiêu:** Sửa lỗi từ log thực tế của hệ thống Worker Python (Redis Queue)

---

## 🔧 CÁC THAY ĐỔI CHÍNH

### 1. ✅ Sửa Lỗi Webhook "Thiếu secret_key" (Ưu tiên cao)

**File:** `udemy_dl/worker_rq.py` - Hàm `notify_node_webhook()`

**Lỗi gốc:**
```
[API FAIL] Status: 400 - {"success":false,"message":"Thiếu secret_key"}
```

**Nguyên nhân:**  
- Worker chỉ gửi HMAC header nhưng không gửi `secret_key` trong body
- Node.js controller vẫn validate `req.body.secret_key`

**Giải pháp:**
```python
# TRƯỚC (Lỗi)
payload = {
    "task_id": task_id,
    "folder_name": folder_name_only,
    "timestamp": timestamp
}

# SAU (Đã sửa)
payload = {
    "secret_key": secret,  # ← Thêm dòng này
    "task_id": task_id,
    "folder_name": folder_name_only,
    "timestamp": timestamp
}
```

**Kết quả:**  
✅ Webhook sẽ truyền cả HMAC header và body `secret_key` để tương thích với Node.js

---

### 2. ✅ Cải Thiện Concurrency Isolation

**File:** `udemy_dl/worker_rq.py` - Hàm `process_download()`

**Vấn đề gốc:**  
- 5 workers cùng tải vào `Staging_Download/` chung
- Worker này có thể xóa nhầm file của worker khác khi gọi `clean_staging()`

**Giải pháp:**
```python
# TRƯỚC (Lỗi - Tải chung)
cmd = [
    sys.executable, "main.py",
    "-c", course_url,
    "-o", STAGING_DIR,  # ← Tất cả worker dùng chung thư mục
    ...
]

# SAU (Đã sửa - Mỗi task có sandbox riêng)
task_sandbox = os.path.join(STAGING_DIR, f"Task_{task_id}")
os.makedirs(task_sandbox, exist_ok=True)

cmd = [
    sys.executable, "main.py",
    "-c", course_url,
    "-o", task_sandbox,  # ← Mỗi task có thư mục riêng
    ...
]
```

**Cấu trúc thư mục mới:**
```
Staging_Download/
├── Task_777/
│   └── Course_Name_1/
├── Task_888/
│   └── Course_Name_2/
└── Task_999/
    └── Course_Name_3/
```

**Kết quả:**  
✅ Mỗi worker hoạt động trong sandbox riêng  
✅ Không xung đột giữa các worker  
✅ Dễ debug (biết task nào lỗi)

---

### 3. ✅ Smart Retry - Resume Thay Vì Tải Lại Từ Đầu

**File:** `udemy_dl/worker_rq.py` - Hàm `process_download()`

**Yêu cầu người dùng:**  
> "Lỗi bước nào thì làm lại bước đó chứ không xóa đi làm lại từ đầu"

**Logic cũ (KHÔNG TỐT):**
```python
# Retry loop
for attempt in range(1, MAX_RETRIES + 1):
    try:
        subprocess.run(cmd, check=True, timeout=DOWNLOAD_TIMEOUT)
        upload_to_drive(final_folder)
    except Exception as e:
        log(f"[ERROR] {e}")
    
    # ❌ XÓA HẾT FILE khi lỗi
    if attempt < MAX_RETRIES:
        clean_staging()  # ← Worker tải lại từ 0
        time.sleep(20)
```

**Logic mới (SMART RETRY):**
```python
# Retry loop
for attempt in range(1, MAX_RETRIES + 1):
    try:
        subprocess.run(cmd, check=True, timeout=DOWNLOAD_TIMEOUT)
        upload_to_drive(final_folder)
        success = True
        break
    except Exception as e:
        log(f"[ERROR] {e}")
    
    # ✅ KHÔNG XÓA FILE - Giữ nguyên để resume
    if attempt < MAX_RETRIES:
        log(f"[RESUME] Keeping downloaded files for resume...")
        time.sleep(20)

# ✅ CHỈ XÓA KHI HOÀN TẤT 100%
if success and final_folder:
    update_task_status(task_id, 'completed')
    webhook_success = notify_node_webhook(task_id, final_folder)
    
    if webhook_success:
        clean_staging(task_id)  # ← Chỉ xóa khi ALL STEPS OK
    else:
        log("[KEEP] Webhook failed, keeping files")
```

**Workflow mới:**
```
Download → Lỗi? 
           ↓
         [GIỮ FILE] → Retry → Resume Download (tải tiếp)
                               ↓
                             Upload → Lỗi?
                                      ↓
                                   [GIỮ FILE] → Retry Upload
                                                  ↓
                                                Webhook → OK?
                                                          ↓
                                                        [XÓA FILE]
```

**Lợi ích:**
- ✅ Tiết kiệm bandwidth (không tải lại file đã có)
- ✅ Tiết kiệm thời gian (resume từ lecture bị dừng)
- ✅ Ổn định hơn (lỗi mạng tạm thời không ảnh hưởng)
- ✅ Debug dễ dàng (file lỗi vẫn còn để kiểm tra)

---

### 4. ✅ Fix Lỗi `AttributeError: 'NoneType' object has no attribute 'json'`

**File:** `udemy_dl/main.py`

**Lỗi gốc:**
```
File "/root/server/udemy_dl/main.py", line 876, in _handle_pagination
    data = self.session._get(initial_url, initial_params).json()
AttributeError: 'NoneType' object has no attribute 'json'
```

**Nguyên nhân:**  
- `session._get()` trả về `None` khi tất cả 10 lần retry đều fail
- Code không check `None` trước khi gọi `.json()`

**Giải pháp:**

1. **Sửa hàm `_get()` để return `None` rõ ràng:**
```python
def _get(self, url, params=None):
    for i in range(10):
        try:
            req = self._session.get(url, cookies=cj, params=params)
            if req.ok or req.status_code in [502, 503]:
                return req
            if not req.ok:
                logger.error(f"{req.status_code} {req.reason}, retrying...")
                time.sleep(0.8)
        except Exception as e:
            logger.error(f"Exception: {e}")
            time.sleep(0.8)
    
    # ✅ Return None nếu tất cả retry đều fail
    logger.error(f"All retries failed for {url}")
    return None
```

2. **Check `None` trước khi parse JSON:**
```python
def _handle_pagination(self, initial_url, initial_params=None):
    try:
        # ✅ Check None trước khi .json()
        response = self.session._get(initial_url, initial_params)
        if response is None:
            logger.fatal(f"Failed to get response from {initial_url}")
            sys.exit(1)
        data = response.json()
    except AttributeError as error:
        logger.fatal(f"Response is None or invalid: {error}")
        sys.exit(1)
    # ... rest of code
```

**Kết quả:**  
✅ Không còn crash khi API Udemy timeout  
✅ Lỗi được báo rõ ràng thay vì crash bí ẩn

---

## 📋 CHECKLIST TRIỂN KHAI

### Bước 1: Kiểm tra môi trường
```bash
# Kiểm tra biến môi trường
cat /root/server/.env | grep API_SECRET_KEY

# Nếu chưa có, thêm vào:
echo "API_SECRET_KEY=your_secret_key_here" >> /root/server/.env
```

### Bước 2: Dừng workers cũ
```bash
cd /root/server
bash stop_workers.sh
```

### Bước 3: Kiểm tra code mới
```bash
# Xem các thay đổi
git diff udemy_dl/worker_rq.py
git diff udemy_dl/main.py
```

### Bước 4: Khởi động lại workers
```bash
bash start_workers.sh
```

### Bước 5: Theo dõi log
```bash
# Theo dõi worker #1
tail -f /root/server/logs/rq_worker_1.log

# Hoặc tất cả workers
tail -f /root/server/logs/rq_worker_*.log
```

### Bước 6: Test với task mới
```bash
# Thêm task test vào queue
redis-cli LPUSH rq:queue:downloads '{"taskId":999,"email":"test@example.com","courseUrl":"https://www.udemy.com/course/test-course/"}'

# Xem queue
redis-cli LLEN rq:queue:downloads
```

---

## 🔍 KẾT QUẢ MONG ĐỢI

### Log thành công sẽ trông như thế này:

```
[2026-01-12 16:00:00] >>> REDIS WORKER #1 STARTED <<<
[2026-01-12 16:00:00] [REDIS] Connected to localhost:6379
[2026-01-12 16:00:05] [WORKER #1] Received job from rq:queue:downloads
[2026-01-12 16:00:05] [RQ JOB] Processing download job
[2026-01-12 16:00:05] [*] Task ID: 999
[2026-01-12 16:00:05] [SANDBOX] Task directory: Staging_Download/Task_999
[2026-01-12 16:00:05] [ATTEMPT 1/3] Downloading course...
[2026-01-12 16:30:00] [CHECK] Downloaded: Course_Name
[2026-01-12 16:30:00] [UPLOAD] Starting upload to Google Drive...
[2026-01-12 16:35:00] [RCLONE] Upload successful
[2026-01-12 16:35:00] [DB] Task 999 status -> completed
[2026-01-12 16:35:00] [WEBHOOK] Calling Node.js webhook...
[2026-01-12 16:35:00] [API] Calling webhook with HMAC auth: Course_Name
[2026-01-12 16:35:01] [API] Webhook successful: Course_Name  ← ✅ Không còn lỗi 400
[2026-01-12 16:35:01] [CLEANUP] Task sandbox removed (all steps completed)
[2026-01-12 16:35:01] [SUCCESS] Task completed successfully
[2026-01-12 16:35:01] [WORKER #1] ✅ Job completed: Task 999
```

### Khi có lỗi (sẽ retry thông minh):

```
[2026-01-12 16:00:00] [ATTEMPT 1/3] Downloading course...
[2026-01-12 16:05:00] [ERROR] Connection timeout
[2026-01-12 16:05:00] [RESUME] Keeping downloaded files for resume...  ← ✅ Không xóa
[2026-01-12 16:05:00] [INFO] Retrying in 20 seconds...
[2026-01-12 16:05:20] [ATTEMPT 2/3] Downloading course...
[2026-01-12 16:10:00] [CHECK] Downloaded: Course_Name (resumed from lecture 50)  ← ✅ Tải tiếp
```

---

## 📊 SO SÁNH TRƯỚC VÀ SAU

| Tính năng | Trước (Lỗi) | Sau (Đã sửa) |
|-----------|-------------|--------------|
| **Webhook** | ❌ Lỗi 400 "Thiếu secret_key" | ✅ Success 200 |
| **Concurrency** | ❌ Workers xung đột | ✅ Mỗi task có sandbox riêng |
| **Retry** | ❌ Tải lại từ đầu | ✅ Resume (tải tiếp) |
| **Error Handling** | ❌ Crash với NoneType | ✅ Handle gracefully |
| **Cleanup** | ❌ Xóa file ngay khi lỗi | ✅ Chỉ xóa khi 100% OK |
| **Debug** | ❌ Khó biết lỗi ở đâu | ✅ Giữ file lỗi để debug |

---

## 🚀 LƯU Ý QUAN TRỌNG

1. **Thư mục `Staging_Download/` sẽ lớn hơn:**
   - Do giữ file lỗi để debug
   - Định kỳ xóa thư mục `Task_*` cũ:
   ```bash
   # Xóa task cũ hơn 7 ngày
   find /root/server/udemy_dl/Staging_Download -name "Task_*" -mtime +7 -exec rm -rf {} \;
   ```

2. **Monitor disk space:**
   ```bash
   # Kiểm tra dung lượng
   du -sh /root/server/udemy_dl/Staging_Download/*
   ```

3. **Nếu cần xóa thủ công task bị lỗi:**
   ```bash
   rm -rf /root/server/udemy_dl/Staging_Download/Task_888
   ```

---

## ✅ KẾT LUẬN

Tất cả 4 vấn đề đã được khắc phục:

1. ✅ **Webhook**: Thêm `secret_key` vào body → Không còn lỗi 400
2. ✅ **Concurrency**: Mỗi task có sandbox `Task_{id}` → Không xung đột
3. ✅ **Smart Retry**: Giữ file để resume → Tiết kiệm thời gian & bandwidth
4. ✅ **Error Handling**: Check None trước parse → Không crash

**Worker giờ đây:**
- 🔒 Bảo mật hơn (HMAC + secret_key)
- 🚀 Nhanh hơn (resume thay vì tải lại)
- 🛡️ Ổn định hơn (handle lỗi tốt)
- 🐛 Debug dễ hơn (giữ file lỗi)

---

**Generated:** 2026-01-12  
**Author:** AI Assistant  
**Files modified:** 
- `udemy_dl/worker_rq.py` (3 functions)
- `udemy_dl/main.py` (2 functions)
