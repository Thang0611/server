# 📊 Quy Trình Download - Phân Tích Kiến Trúc Hệ Thống Toàn Diện

**Ngày Báo Cáo:** 12 Tháng 1, 2026  
**Vai Trò Phân Tích:** Kiến Trúc Sư Hệ Thống Cấp Cao  
**Hệ Thống:** Node.js Backend + Python Worker Download Pipeline

---

## 🎯 Tóm Tắt Tổng Quan

Hệ thống này điều phối việc download khóa học thông qua **kiến trúc hai tầng**:
- **Node.js Backend** xử lý thanh toán, quản lý đơn hàng và điều phối
- **Python Worker** xử lý đăng ký Udemy và download khóa học lên Google Drive

**Phát Hiện Chính:** Kiến trúc hiện tại **hoạt động nhưng có lỗ hổng nghiêm trọng về khả năng mở rộng và bảo mật** có thể gây lỗi hệ thống dưới tải cao hoặc lộ dữ liệu nhạy cảm.

---

## 1️⃣ LUỒNG DỮ LIỆU: Vòng Đời Đầu Cuối

### 📝 Hành Trình Đầy Đủ từ Thanh Toán → Download → Giao Hàng

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     TRÌNH TỰ QUY TRÌNH DOWNLOAD                         │
└─────────────────────────────────────────────────────────────────────────┘

 CLIENT                 NODE.JS                   DATABASE              PYTHON WORKER              GDRIVE
   │                       │                          │                        │                      │
   │ 1. Tạo Đơn Hàng       │                          │                        │                      │
   │─────────────────────>│                          │                        │                      │
   │                       │                          │                        │                      │
   │                       │ 2. Tạo Order             │                        │                      │
   │                       │  (status: pending)       │                        │                      │
   │                       │─────────────────────────>│                        │                      │
   │                       │                          │                        │                      │
   │                       │ 3. Tạo DownloadTasks     │                        │                      │
   │                       │  (status: paid)          │                        │                      │
   │                       │─────────────────────────>│                        │                      │
   │                       │                          │                        │                      │
   │<─────────────────────│ 4. Trả về Mã QR          │                        │                      │
   │   (order_code: DHxxxxxx)                        │                        │                      │
   │                       │                          │                        │                      │
   │                       │                          │                        │                      │
   │ 5. Khách Thanh Toán   │                          │                        │                      │
   │   qua App Banking     │                          │                        │                      │
   │                       │                          │                        │                      │
   │                       │                          │                        │                      │
SEPAY                     │                          │                        │                      │
   │ 6. Webhook POST       │                          │                        │                      │
   │  /api/v1/payment/     │                          │                        │                      │
   │   webhook             │                          │                        │                      │
   │──────────────────────>│                          │                        │                      │
   │  {                    │                          │                        │                      │
   │   code: "DH123456",   │                          │                        │                      │
   │   transferAmount: ... │                          │                        │                      │
   │  }                    │                          │                        │                      │
   │                       │                          │                        │                      │
   │                       │ 7. Xác Minh Auth Header  │                        │                      │
   │                       │  (SEPAY_API_KEY)         │                        │                      │
   │                       │                          │                        │                      │
   │                       │ 8. Tìm Order             │                        │                      │
   │                       │  (theo order_code)       │                        │                      │
   │                       │─────────────────────────>│                        │                      │
   │                       │<─────────────────────────│                        │                      │
   │                       │                          │                        │                      │
   │                       │ 9. BẮT ĐẦU TRANSACTION   │                        │                      │
   │                       │─────────────────────────>│                        │                      │
   │                       │                          │                        │                      │
   │                       │ 10. Cập Nhật Order       │                        │                      │
   │                       │   payment_status='paid'  │                        │                      │
   │                       │─────────────────────────>│                        │                      │
   │                       │                          │                        │                      │
   │                       │ 11. Cập Nhật DownloadTasks│                       │                      │
   │                       │   status: 'paid'         │                        │                      │
   │                       │          ↓               │                        │                      │
   │                       │   status: 'processing'   │                        │                      │
   │                       │─────────────────────────>│                        │                      │
   │                       │                          │                        │                      │
   │                       │ 12. COMMIT TRANSACTION   │                        │                      │
   │                       │─────────────────────────>│                        │                      │
   │                       │                          │                        │                      │
   │<──────────────────────│ 13. Trả Về 200 OK        │                        │                      │
   │   (cho SEPAY)         │                          │                        │                      │
   │                       │                          │                        │                      │
   │                       │ 14. processOrder()       │                        │                      │
   │                       │   Tìm task với           │                        │                      │
   │                       │   status='processing'    │                        │                      │
   │                       │─────────────────────────>│                        │                      │
   │                       │<─────────────────────────│                        │                      │
   │                       │                          │                        │                      │
   │                       │ 15. downloadWorker.      │                        │                      │
   │                       │     processTask(task)    │                        │                      │
   │                       │     [Node.js Worker]     │                        │                      │
   │                       │          │               │                        │                      │
   │                       │          │ 16. Đăng Ký  │                        │                      │
   │                       │          │  (Udemy API)  │                        │                      │
   │                       │          │               │                        │                      │
   │                       │          │ 17. Cập Nhật │                        │                      │
   │                       │          │  status:     │                        │                      │
   │                       │          │  'enrolled'  │                        │                      │
   │                       │          └──────────────>│                        │                      │
   │                       │                          │                        │                      │
   │                       │                          │   [PYTHON WORKER       │                      │
   │                       │                          │    POLLING LOOP]       │                      │
   │                       │                          │                        │                      │
   │                       │                          │ 18. Query tìm task     │                      │
   │                       │                          │    status='enrolled'   │                      │
   │                       │                          │<───────────────────────│                      │
   │                       │                          │────────────────────────>                      │
   │                       │                          │                        │                      │
   │                       │                          │ 19. Cập nhật status:   │                      │
   │                       │                          │    'processing'        │                      │
   │                       │                          │<───────────────────────│                      │
   │                       │                          │                        │                      │
   │                       │                          │                        │ 20. Download Khóa Học│
   │                       │                          │                        │  (main.py +         │
   │                       │                          │                        │   --browser chrome) │
   │                       │                          │                        │                      │
   │                       │                          │                        │ 21. Upload lên Drive│
   │                       │                          │                        │  (rclone move)      │
   │                       │                          │                        │─────────────────────>│
   │                       │                          │                        │<─────────────────────│
   │                       │                          │                        │                      │
   │                       │                          │ 22. Cập Nhật DB:       │                      │
   │                       │                          │    status='completed'  │                      │
   │                       │                          │<───────────────────────│                      │
   │                       │                          │                        │                      │
   │                       │ 23. POST Webhook         │                        │                      │
   │                       │  /api/v1/webhook/        │                        │                      │
   │                       │   finalize               │                        │                      │
   │                       │<─────────────────────────────────────────────────│                      │
   │                       │  {                       │                        │                      │
   │                       │   secret_key: "...",     │                        │                      │
   │                       │   task_id: 123,          │                        │                      │
   │                       │   folder_name: "..."     │                        │                      │
   │                       │  }                       │                        │                      │
   │                       │                          │                        │                      │
   │                       │ 24. Xác minh secret_key  │                        │                      │
   │                       │                          │                        │                      │
   │                       │ 25. Tìm Drive Folder     │                        │                      │
   │                       │  (retry 10 lần)          │                        │ 26. Search API      │
   │                       │──────────────────────────────────────────────────────────────────────────>│
   │                       │<──────────────────────────────────────────────────────────────────────────│
   │                       │                          │                        │                      │
   │                       │ 27. Cấp Quyền Read       │                        │                      │
   │                       │  (cho email khách)       │                        │ 28. Permissions API │
   │                       │──────────────────────────────────────────────────────────────────────────>│
   │                       │                          │                        │                      │
   │                       │ 29. Cập Nhật DownloadTask│                        │                      │
   │                       │   driver_url: "..."      │                        │                      │
   │                       │   driver_folder: "..."   │                        │                      │
   │                       │   status: 'completed'    │                        │                      │
   │                       │─────────────────────────>│                        │                      │
   │                       │                          │                        │                      │
   │                       │ 30. Gửi Email            │                        │                      │
   │                       │  (Link Drive + thông tin │                        │                      │
   │                       │   khóa học cho khách)    │                        │                      │
   │                       │                          │                        │                      │
   │<──────────────────────│ 31. Trả Về 200 OK        │                        │                      │
   │  (cho Python)         │                          │                        │                      │
   │                       │                          │                        │                      │
```

---

## 2️⃣ PHÂN TÍCH CƠ CHẾ

### 🔧 A. Phương Thức Kích Hoạt

**Triển Khai Hiện Tại:**

1. **Kích Hoạt Thanh Toán:**
   - **Phương thức:** Webhook callback từ cổng thanh toán SePay
   - **Endpoint:** `/api/v1/payment/webhook`
   - **Xác thực:** Xác minh header `Authorization: Apikey ${SEPAY_API_KEY}`
   - **Controller:** `src/controllers/payment.controller.js::handleWebhook()`

2. **Kích Hoạt Download:**
   - **Phương thức:** **Gọi hàm trực tiếp** (KHÔNG spawn process)
   - **Cơ chế:** 
     ```javascript
     // Trong payment.service.js:
     downloadWorker.processTask(task).catch(err => { ... })
     ```
   - **Vị trí:** `src/workers/download.worker.js::processTask()`
   - **Bất đồng bộ:** Có (fire-and-forget với error handler `.catch()`)

3. **Python Worker:**
   - **Phương thức:** **Vòng lặp polling độc lập** (KHÔNG được spawn bởi Node.js)
   - **Process:** Script Python standalone chạy liên tục
   - **Polling Query:**
     ```sql
     SELECT id, course_url, email 
     FROM download_tasks 
     WHERE status = 'enrolled' 
     ORDER BY created_at ASC 
     LIMIT 1 FOR UPDATE
     ```
   - **Khoảng thời gian:** Mỗi 10 giây (`time.sleep(10)`)

### 🔌 B. Cơ Chế Giao Tiếp

**Node.js → Python:**
- **Phương thức:** Giao tiếp qua database (KHÔNG phải IPC trực tiếp)
- **Luồng:**
  1. Node.js cập nhật `download_tasks.status = 'enrolled'`
  2. Python poll database tìm `status='enrolled'`
  3. Python cập nhật `status='processing'` để claim task

**Python → Node.js:**
- **Phương thức:** HTTP Webhook POST request
- **Endpoint:** `https://api.khoahocgiare.info/api/v1/webhook/finalize`
- **Payload:**
  ```json
  {
    "secret_key": "API_SECRET_KEY từ .env",
    "task_id": 123,
    "folder_name": "Tên Khóa Học (Đã Sanitize)"
  }
  ```
- **Xác thực:** Shared secret key (`API_SECRET_KEY` trong `.env`)

### 🔑 C. Tham Số & Cấu Hình

**Node.js Worker (Giai Đoạn Đăng Ký):**
- **Gọi hàm** với task object chứa:
  - `task.id`, `task.email`, `task.course_url`, `task.status`

**Python Worker (Giai Đoạn Download):**
- **KHÔNG có tham số CLI** - đọc từ database
- **Biến Môi Trường (từ `.env`):**
  - `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
  - `UDEMY_TOKEN` (Bearer token)
  - `API_SECRET_KEY` (cho xác thực webhook)
- **Cấu Hình Hardcode:**
  ```python
  UDEMY_TOKEN = os.getenv('UDEMY_TOKEN')
  STAGING_DIR = "Staging_Download"
  RCLONE_REMOTE = "gdrive"
  RCLONE_DEST_PATH = "UdemyCourses/download_khoahoc"
  MAX_RETRIES = 3
  ```

### 🔐 D. Phương Thức Xác Thực

1. **Udemy API (Python):**
   - **Phương thức:** Trích xuất cookie từ trình duyệt
   - **Triển khai:**
     ```python
     cj = browser_cookie3.chrome()  # Trích xuất cookie từ Chrome
     self.session._get(url, cookies=cj, ...)
     ```
   - **Fallback:** Bearer token qua biến env `UDEMY_TOKEN`
   - **Vị trí:** `udemy_dl/main.py` dòng 414-431

2. **Google Drive (Python qua Rclone):**
   - **Phương thức:** Rclone với Service Account hoặc OAuth
   - **Config:** Giả định trong `~/.config/rclone/rclone.conf`
   - **Lệnh:** `rclone move <local> gdrive:UdemyCourses/...`

3. **Google Drive API (Node.js):**
   - **Phương thức:** Xác thực Service Account
   - **Triển khai:** `src/utils/drive.util.js`
   - **Credentials:** JSON keyfile (đường dẫn trong `GOOGLE_APPLICATION_CREDENTIALS`)

4. **Bảo Mật Webhook:**
   - **Python → Node.js:** Shared secret (`API_SECRET_KEY`)
   - **SePay → Node.js:** API key trong Authorization header

---

## 3️⃣ ĐÁNH GIÁ NGHIÊM TRỌNG

### 🚨 A. NGHẼN CỔ CHAI

#### ❌ **NGHIÊM TRỌNG - Python Worker Đơn Luồng**

**Vấn Đề:**
```python
while True:
    task = get_task()
    if not task:
        time.sleep(10)
        continue
    
    # Xử lý task (block ~30-120 phút mỗi khóa học)
    # Chỉ 1 task tại một thời điểm!
```

**Tác Động:**
- **Nếu 100 người thanh toán đồng thời:**
  - ✅ Node.js tạo 100 task ngay lập tức
  - ❌ Python xử lý 1 task mỗi ~60 phút
  - ⏱️ Khách cuối cùng chờ: **100 × 60 = 6,000 phút = HƠN 4 NGÀY**

**Mức Độ:** 🔴 **NGHIÊM TRỌNG - Hệ Thống Sụp Đổ Dưới Tải Cao**

---

#### ⚠️ **CAO - Database Polling Overhead**

**Vấn Đề:**
```python
time.sleep(10)  # Poll mỗi 10 giây
```

**Tác Động:**
- 8,640 truy vấn database mỗi ngày (ngay cả khi idle)
- Lãng phí kết nối database
- Delay 10 giây giữa hoàn thành task và nhận task mới

**Mức Độ:** 🟠 **CAO - Sử Dụng Tài Nguyên Không Hiệu Quả**

---

#### ⚠️ **TRUNG BÌNH - Download Đồng Bộ trong Python**

**Vấn Đề:**
```python
subprocess.run(cmd, check=True, timeout=144000)  # Block nhiều giờ
```

**Tác Động:**
- Không thể xử lý nhiều khóa học đồng thời
- Download dài block khóa học ngắn
- Không có priority queue (chỉ first-come-first-served)

**Mức Độ:** 🟡 **TRUNG BÌNH - Lập Lịch Task Kém**

---

### 🛡️ B. RỦI RO BẢO MẬT

#### 🔴 **NGHIÊM TRỌNG - Secrets Hiện Trong Process List**

**Vấn Đề:**
Python worker load secrets từ `.env` vào môi trường:
```python
UDEMY_TOKEN = os.getenv('UDEMY_TOKEN')
```

**Tuy nhiên,** script main.py có thể nhận bearer token làm argument:
```python
# Từ code comment trong worker.py (dòng 223-231):
cmd = [sys.executable, "main.py",
       "-c", url, 
       "-b", UDEMY_TOKEN,  # ⚠️ Bearer token trong command line!
       ...
]
```

**Khai Thác:**
```bash
$ ps aux | grep python
# Output có thể hiển thị:
python main.py -b eyJhbGciOiJIUzI1NiIs...  # ⚠️ TOKEN BỊ LỘ
```

**Tác Động:**
- Bất kỳ user nào trên server có thể thấy Udemy bearer token
- Token có thể được dùng để truy cập tài khoản Udemy
- `ps`, `htop`, `/proc/<pid>/cmdline` đều lộ thông tin này

**Mức Độ:** 🔴 **NGHIÊM TRỌNG - Lộ Thông Tin Xác Thực**

---

#### 🟠 **CAO - Xác Thực Webhook Yếu**

**Vấn Đề:**
```javascript
// webhook.service.js dòng 176
if (secretKey !== SERVER_SECRET) {
  throw new AppError('Forbidden: Wrong Key', 403);
}
```

**Vấn Đề:**
1. **Static shared secret** (không có cơ chế rotation)
2. **Không có request signing** (replay attack có thể)
3. **Không có timestamp validation** (chấp nhận request cũ)
4. **Không có IP whitelisting** (ai có key đều gọi được)

**Kịch Bản Khai Thác:**
1. Attacker phát hiện `API_SECRET_KEY` (leak trong log, git history, v.v.)
2. Attacker gọi `/api/v1/webhook/finalize` với bất kỳ `task_id`
3. Hệ thống cấp quyền Drive và gửi email cho email của attacker

**Mức Độ:** 🟠 **CAO - Truy Cập Tài Nguyên Trái Phép**

---

#### 🟠 **CAO - Thông Tin Xác Thực Database Trong Python Environment**

**Vấn Đề:**
```python
DB_CONFIG = {
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'host': os.getenv('DB_HOST'),
    'database': os.getenv('DB_NAME'),
}
conn = mysql.connector.connect(**DB_CONFIG)
```

**Vấn Đề:**
1. Python worker có **quyền truy cập database đầy đủ** (không giới hạn bảng cụ thể)
2. Không tuân thủ nguyên tắc least privilege (có thể đọc/ghi bất kỳ bảng nào)
3. Rủi ro SQL injection nếu truy vấn database được xây dựng không đúng

**Khuyến Nghị:** Sử dụng database role với quyền hạn chế:
```sql
CREATE USER 'udemy_worker'@'%' IDENTIFIED BY '...';
GRANT SELECT, UPDATE ON database.download_tasks TO 'udemy_worker'@'%';
```

**Mức Độ:** 🟠 **CAO - Quyền Database Quá Mức**

---

#### 🟡 **TRUNG BÌNH - Không Có Input Validation Trên Webhook**

**Vấn Đề:**
```javascript
// webhook.controller.js dòng 17-22
const { secret_key, task_id, folder_name } = req.body;

if (!secret_key || !task_id || !folder_name) {
  throw new AppError('Thiếu thông tin bắt buộc', 400);
}
```

**Vấn Đề:**
- `task_id` không được validate là integer
- `folder_name` không được sanitize (khả năng path traversal)
- Không kiểm tra độ dài tối đa (DoS qua payload lớn)

**Mức Độ:** 🟡 **TRUNG BÌNH - Vector Injection/DoS**

---

### 💥 C. KHOẢNG TRỐNG XỬ LÝ LỖI

#### 🔴 **NGHIÊM TRỌNG - Python Crash = Lỗi Im Lặng**

**Vấn Đề:**
```python
# worker.py dòng 502-506
if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Worker Stopped.")
```

**Vấn Đề:**
1. **Không có giám sát/cảnh báo** nếu Python worker crash
2. **Không có cơ chế tự khởi động lại** (cần can thiệp thủ công)
3. **Task database stuck ở trạng thái 'enrolled'** mãi mãi
4. **Không có health check endpoint** (không thể giám sát từ Node.js)

**Tác Động:**
- Worker crash im lặng lúc 3 giờ sáng
- Tất cả task pending ngừng xử lý
- Khách hàng không bao giờ nhận được download
- Hệ thống có vẻ "hoạt động" (đơn hàng được chấp nhận, thanh toán xử lý)
- **Không ai biết** cho đến khi khách hàng phàn nàn

**Mức Độ:** 🔴 **NGHIÊM TRỌNG - Lỗi Hệ Thống Vô Hình**

---

#### 🟠 **CAO - Lỗi Network Trong Webhook**

**Vấn Đề:**
```python
# worker.py dòng 415-422
try:
    res = requests.post(api_url, json=payload, timeout=30)
    if res.status_code == 200:
        log("[API] Success Webhook")
    else:
        log(f"[API WARN] Server error: {res.text}")
except Exception as e:
    log(f"[API ERR] Cannot call API: {e}")
```

**Vấn Đề:**
1. **Task đánh dấu 'completed' trong DB** trước khi webhook thành công
2. Nếu webhook thất bại, **link Drive không bao giờ được lưu** trong database
3. **Email không bao giờ được gửi** cho khách hàng
4. **Không có cơ chế retry** cho webhook thất bại

**Tác Động:**
- Khóa học được download và upload thành công
- Nhưng khách hàng không bao giờ nhận được link Drive
- Task hiển thị "completed" nhưng không được cấp quyền truy cập

**Mức Độ:** 🟠 **CAO - Dữ Liệu Không Nhất Quán**

---

#### 🟠 **CAO - Race Condition Trong Claim Task**

**Vấn Đề:**
```python
# worker.py dòng 369-375
cur.execute("SELECT id, course_url, email FROM download_tasks 
             WHERE status = 'enrolled' ORDER BY created_at ASC LIMIT 1 FOR UPDATE")
task = cur.fetchone()

if task:
    cur.execute("UPDATE download_tasks SET status = 'processing', 
                 updated_at = NOW() WHERE id = %s", (task['id'],))
    conn.commit()
```

**Vấn Đề:**
1. Nếu transaction thất bại **sau SELECT nhưng trước UPDATE**
2. Task vẫn ở 'enrolled' nhưng worker nghĩ nó đang processing
3. Nếu scale lên **2 Python worker**, có thể claim cùng task

**Trạng Thái Hiện Tại:** Được giảm thiểu bởi khóa `FOR UPDATE` (tốt!)  
**Rủi Ro Tương Lai:** Nếu thêm nhiều worker, cần distributed locking

**Mức Độ:** 🟡 **TRUNG BÌNH - Tiềm Năng Khi Scale**

---

#### 🟡 **TRUNG BÌNH - Download Thất Bại Không Được Retry**

**Vấn Đề:**
```python
# worker.py dòng 459-489
for attempt in range(1, MAX_RETRIES + 1):
    try:
        subprocess.run(cmd, check=True, timeout=144000)
        # ... upload ...
        if upload_to_drive(final_folder):
            success = True
            break
    except Exception as e:
        log(f"[ERR] {e}")
        clean_staging()
        time.sleep(20)

if success:
    update_status(task['id'], 'completed')
else:
    update_status(task['id'], 'failed')  # ❌ Không retry sau này
```

**Vấn Đề:**
1. Sau 3 lần thất bại, task đánh dấu 'failed' vĩnh viễn
2. **Không có cơ chế retry task thất bại** sau này
3. Lỗi tạm thời (network hiccup, Udemy rate limit) gây thất bại vĩnh viễn

**Tác Động:**
- Lỗi Udemy API tạm thời → Task thất bại mãi mãi
- Khách hàng đã thanh toán nhưng không bao giờ nhận được khóa học
- Cần can thiệp database thủ công

**Mức Độ:** 🟡 **TRUNG BÌNH - Khả Năng Phục Hồi Kém**

---

#### 🟡 **TRUNG BÌNH - Không Có Timeout Trên Tìm Kiếm Drive Folder**

**Vấn Đề:**
```javascript
// webhook.service.js dòng 28-44
const findFolderWithRetry = async (folderName) => {
  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const folder = await findFolderByName(folderName);
      if (folder) return folder;
    } catch (error) { ... }
    await wait(RETRY_DELAY_MS);  // 3 giây
  }
  return null;  // ❌ Trả về null sau 30 giây, task đánh dấu 'failed'
}
```

**Vấn Đề:**
1. Nếu rclone upload chậm, file có thể chưa được index
2. Sau 30 giây (10 retry × 3s), bỏ cuộc
3. Task đánh dấu 'failed' mặc dù upload thành công

**Mức Độ:** 🟡 **TRUNG BÌNH - False Negative**

---

## 4️⃣ KHUYẾN NGHỊ

### 🚀 Ưu Tiên 1: SỬA NGAY (Trong 1 Tuần)

#### 1. **Thêm Giám Sát Process & Tự Khởi Động Lại**

**Vấn Đề:** Python worker crash = lỗi im lặng

**Giải Pháp:** Sử dụng `systemd` (Linux) hoặc `supervisor` (cross-platform)

**Triển Khai:**

**Tạo `/etc/systemd/system/udemy-worker.service`:**
```ini
[Unit]
Description=Udemy Download Worker
After=network.target mysql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/root/server/udemy_dl
Environment="PATH=/usr/bin:/usr/local/bin"
ExecStart=/usr/bin/python3 /root/server/udemy_dl/worker.py
Restart=always
RestartSec=10
StandardOutput=append:/var/log/udemy-worker.log
StandardError=append:/var/log/udemy-worker-error.log

[Install]
WantedBy=multi-user.target
```

**Enable và start:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable udemy-worker.service
sudo systemctl start udemy-worker.service
```

**Lợi Ích:**
- ✅ Tự khởi động lại khi crash
- ✅ Log vào `/var/log/udemy-worker.log`
- ✅ Khởi động khi server reboot
- ✅ Có thể giám sát với `systemctl status udemy-worker`

---

#### 2. **Triển Khai Xác Thực Webhook & Bảo Vệ Replay**

**Vấn Đề:** Xác thực yếu, replay attack có thể

**Giải Pháp:** Thêm chữ ký HMAC-SHA256 + validation timestamp

**Python side (`worker.py`):**
```python
import hmac
import hashlib
import time

def notify_node_webhook(task_id, folder_name_local):
    api_url = "https://api.khoahocgiare.info/api/v1/webhook/finalize"
    secret = os.getenv('API_SECRET_KEY')
    timestamp = str(int(time.time()))
    
    payload = {
        "task_id": task_id,
        "folder_name": os.path.basename(folder_name_local),
        "timestamp": timestamp
    }
    
    # Tạo chữ ký
    message = f"{task_id}{folder_name_local}{timestamp}"
    signature = hmac.new(
        secret.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    headers = {
        "X-Signature": signature,
        "X-Timestamp": timestamp
    }
    
    try:
        res = requests.post(api_url, json=payload, headers=headers, timeout=30)
        # ...
```

**Node.js side (`webhook.controller.js`):**
```javascript
const crypto = require('crypto');

const finalizeDownload = asyncHandler(async (req, res, next) => {
  const { task_id, folder_name, timestamp } = req.body;
  const signature = req.headers['x-signature'];
  
  // Xác minh timestamp (từ chối nếu cũ hơn 5 phút)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    throw new AppError('Request hết hạn', 401);
  }
  
  // Xác minh chữ ký
  const message = `${task_id}${folder_name}${timestamp}`;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.API_SECRET_KEY)
    .update(message)
    .digest('hex');
  
  if (signature !== expectedSignature) {
    throw new AppError('Chữ ký không hợp lệ', 403);
  }
  
  // Tiếp tục xử lý...
});
```

**Lợi Ích:**
- ✅ Ngăn chặn replay attack
- ✅ Ngăn chặn giả mạo payload
- ✅ Request giới hạn thời gian (cửa sổ 5 phút)

---

### 🔧 Ưu Tiên 2: CẢI THIỆN KHẢ NĂNG MỞ RỘNG (Trong 1 Tháng)

#### 3. **Migration Sang Message Queue (Redis/BullMQ)**

**Vấn Đề:** Database polling không hiệu quả, nghẽn worker đơn

**Giải Pháp:** Thay database polling bằng Redis queue

**Kiến Trúc:**

```
┌──────────────┐         ┌──────────┐         ┌────────────────┐
│   Node.js    │────────>│  Redis   │────────>│ Python Worker  │
│   Backend    │  Push   │  Queue   │  Pop    │   (Nhiều)      │
└──────────────┘  Task   └──────────┘  Task   └────────────────┘
                                                       │
                                                       ├─ Worker 1
                                                       ├─ Worker 2
                                                       ├─ Worker 3
                                                       └─ Worker N
```

**Lợi Ích:**
- ✅ **Giao task ngay lập tức** (không delay 10 giây polling)
- ✅ **Scale ngang** (chạy 10+ worker trên các server khác nhau)
- ✅ **Priority queue** (khách VIP trước)
- ✅ **Job retry** (tự động retry với exponential backoff)
- ✅ **Job metrics** (số lượng pending/completed/failed realtime)

**Ví dụ với BullMQ (Node.js):**

```javascript
// payment.service.js
const { Queue } = require('bullmq');
const downloadQueue = new Queue('downloads', {
  connection: { host: 'localhost', port: 6379 }
});

// Sau khi thanh toán xác nhận:
await downloadQueue.add('download-course', {
  taskId: task.id,
  email: task.email,
  courseUrl: task.course_url
}, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 60000 }
});
```

**Python Worker với RQ (Redis Queue):**
```python
import redis
from rq import Worker, Queue

conn = redis.Redis()
queue = Queue('downloads', connection=conn)

def process_download(task_data):
    task_id = task_data['taskId']
    # ... logic download ...

if __name__ == '__main__':
    # Chạy 5 worker song song
    worker = Worker([queue], connection=conn)
    worker.work()
```

**Chạy nhiều worker:**
```bash
# Start 5 worker trên cùng server
for i in {1..5}; do
  python worker_rq.py &
done
```

---

#### 4. **Thêm Health Check Endpoint Cho Python Worker**

**Vấn Đề:** Không thể giám sát Python worker có còn sống

**Giải Pháp:** Thêm HTTP health check server trong Python

**Triển khai (worker.py):**
```python
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
import json

class HealthCheckHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            health_data = {
                "status": "healthy",
                "uptime": time.time() - START_TIME,
                "tasks_processed": TASKS_PROCESSED_COUNT,
                "current_task": CURRENT_TASK_ID or None
            }
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(health_data).encode())
        else:
            self.send_response(404)
            self.end_headers()

def start_health_server():
    server = HTTPServer(('0.0.0.0', 8888), HealthCheckHandler)
    thread = threading.Thread(target=server.serve_forever)
    thread.daemon = True
    thread.start()

# Trong main():
START_TIME = time.time()
start_health_server()
log("Health check server running on :8888/health")
```

**Giám sát từ Node.js:**
```javascript
// src/services/worker-monitor.service.js
const axios = require('axios');

setInterval(async () => {
  try {
    const res = await axios.get('http://localhost:8888/health');
    Logger.info('Python worker health check', res.data);
  } catch (error) {
    Logger.error('Python worker bị DOWN!', error);
    // Gửi email/Slack notification cảnh báo
  }
}, 60000); // Kiểm tra mỗi phút
```

**Lợi Ích:**
- ✅ Giám sát realtime
- ✅ Phát hiện worker crash ngay lập tức
- ✅ Có thể tích hợp với công cụ giám sát (Prometheus, Grafana)

---

### 🔐 Ưu Tiên 3: TĂNG CƯỜNG BẢO MẬT (Trong 2 Tháng)

#### 5. **Không Bao Giờ Truyền Secrets Làm CLI Argument**

**Vấn Đề:** Bearer token hiển thị trong `ps aux`

**Giải Pháp:** Luôn sử dụng biến môi trường hoặc config file

**❌ TỆ (Hiện tại):**
```python
cmd = [sys.executable, "main.py", "-b", UDEMY_TOKEN]
```

**✅ TỐT:**
```python
# Chỉ truyền argument không nhạy cảm
cmd = [sys.executable, "main.py", "-c", url, "-o", output_dir]

# main.py đọc token từ môi trường
bearer_token = os.getenv('UDEMY_TOKEN')
```

---

#### 6. **Triển Khai Database Connection Pooling & Least Privilege**

**Vấn Đề:** Python worker có quyền truy cập database đầy đủ

**Giải Pháp:** Sử dụng database user hạn chế + connection pooling

**Tạo user hạn chế:**
```sql
CREATE USER 'udemy_worker_ro'@'%' IDENTIFIED BY 'secure_password';
GRANT SELECT, UPDATE(status, updated_at, driver_url, error_log) 
  ON database.download_tasks TO 'udemy_worker_ro'@'%';
FLUSH PRIVILEGES;
```

**Triển khai Python:**
```python
from mysql.connector import pooling

# Connection pool (tái sử dụng kết nối)
db_pool = pooling.MySQLConnectionPool(
    pool_name="worker_pool",
    pool_size=5,
    pool_reset_session=True,
    **DB_CONFIG
)

def get_task():
    conn = db_pool.get_connection()
    try:
        # ... query ...
    finally:
        conn.close()  # Trả về pool
```

---

### 📊 Ưu Tiên 4: OBSERVABILITY (Trong 3 Tháng)

#### 7. **Thêm Logging & Metrics Toàn Diện**

**Triển Khai:**

**Python Worker:**
```python
import logging
from pythonjsonlogger import jsonlogger

logger = logging.getLogger()
logHandler = logging.StreamHandler()
formatter = jsonlogger.JsonFormatter()
logHandler.setFormatter(formatter)
logger.addHandler(logHandler)

# Structured logging
logger.info("Task started", extra={
    "task_id": task_id,
    "course_url": url,
    "attempt": attempt
})
```

**Thu Thập Metrics:**
```python
# Sử dụng Prometheus client
from prometheus_client import Counter, Histogram, start_http_server

tasks_processed = Counter('tasks_processed_total', 'Total tasks processed')
download_duration = Histogram('download_duration_seconds', 'Time to download course')

# Trong vòng lặp xử lý:
with download_duration.time():
    # ... download ...
    tasks_processed.inc()

# Start metrics server
start_http_server(9090)  # Prometheus scrape localhost:9090/metrics
```

---

## 📋 BẢNG TÓM TẮT

| Vấn Đề | Mức Độ | Tác Động | Công Sức | Ưu Tiên |
|--------|---------|----------|----------|---------|
| Python worker đơn luồng | 🔴 Nghiêm trọng | Delay hàng ngày dưới tải | Trung bình | P1 |
| Python crash = lỗi im lặng | 🔴 Nghiêm trọng | Hệ thống down, không cảnh báo | Thấp | **P1** |
| Secrets trong command line | 🔴 Nghiêm trọng | Lộ thông tin xác thực | Thấp | **P1** |
| Xác thực webhook yếu | 🟠 Cao | Truy cập trái phép | Trung bình | **P1** |
| Database polling overhead | 🟠 Cao | Lãng phí tài nguyên | Cao | P2 |
| Lỗi network trong webhook | 🟠 Cao | Dữ liệu không nhất quán | Trung bình | P2 |
| Quyền DB quá mức | 🟠 Cao | Rủi ro bảo mật | Thấp | P3 |
| Không retry download thất bại | 🟡 Trung bình | Can thiệp thủ công | Trung bình | P2 |
| Không giám sát process | 🟡 Trung bình | Phản hồi sự cố chậm | Thấp | **P1** |

---

## 🎯 LỘ TRÌNH KHUYẾN NGHỊ

### Tuần 1: Sửa Nghiêm Trọng
1. ✅ Thêm systemd service để tự khởi động lại
2. ✅ Triển khai HMAC webhook authentication
3. ✅ Xóa secrets khỏi CLI argument

### Tuần 2-3: Giám Sát & Cảnh Báo
4. ✅ Thêm health check endpoint
5. ✅ Thiết lập Prometheus + Grafana
6. ✅ Cấu hình email alert cho worker crash

### Tháng 2: Khả Năng Mở Rộng
7. ✅ Migration sang Redis queue (BullMQ/RQ)
8. ✅ Scale lên 3-5 worker song song
9. ✅ Triển khai priority queue

### Tháng 3: Tăng Cường
10. ✅ Database user với quyền tối thiểu
11. ✅ Thêm request rate limiting
12. ✅ Triển khai logging toàn diện

---

## 🏁 KẾT LUẬN

Hệ thống hiện tại **hoạt động với lưu lượng thấp** nhưng có **lỗ hổng nghiêm trọng** trong:
- ❌ **Khả năng mở rộng** (1 worker = nghẽn 60 phút/task)
- ❌ **Độ tin cậy** (lỗi im lặng, không giám sát)
- ❌ **Bảo mật** (thông tin xác thực bị lộ, xác thực yếu)

**Hành Động Ngay Cần Thiết:**
1. Thêm giám sát process (systemd)
2. Triển khai HMAC authentication
3. Xóa secrets khỏi command line

**30 Ngày Tới:**
4. Migration sang message queue (thông lượng tăng 10x)
5. Thêm health check và cảnh báo

Điều này sẽ biến đổi hệ thống từ "hoạt động khi may mắn" sang "độ tin cậy cấp production."

---

**Báo Cáo Được Chuẩn Bị Bởi:** Kiến Trúc Sư Hệ Thống Cấp Cao  
**Ngày:** 12 Tháng 1, 2026  
**Trạng Thái:** 🔴 Cần Hành Động Ngay
