# 🚀 Quy Trình Download - Hướng Dẫn Tham Khảo Nhanh

## 📊 Tổng Quan Hệ Thống

```
┌────────────────────────────────────────────────────────────────────────┐
│                        KIẾN TRÚC HỆ THỐNG                              │
└────────────────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐         ┌──────────────────┐
│   Frontend   │         │   Node.js    │         │  Python Worker   │
│              │◄───────►│   Backend    │◄───────►│  (Độc lập)       │
│ (Khách hàng) │  HTTP   │              │  MySQL  │                  │
└──────────────┘         └──────────────┘         └──────────────────┘
                                │                          │
                                │                          │
                         ┌──────▼──────┐          ┌───────▼────────┐
                         │   MySQL     │          │  Google Drive  │
                         │  Database   │          │   (qua rclone) │
                         └─────────────┘          └────────────────┘
```

---

## 🔄 Luồng Trạng Thái

### Luồng Trạng Thái Order
```
pending → paid → (completed/cancelled/refunded)
```

### Luồng Trạng Thái Download Task
```
paid → processing → enrolled → (đang download) → completed/failed
```

---

## 📁 Tham Chiếu File Chính

### Node.js Backend

| File | Mục Đích | Hàm Chính |
|------|----------|-----------|
| `src/controllers/payment.controller.js` | Xử lý webhook thanh toán | `handleWebhook()` - Nhận thông báo từ SePay |
| `src/services/payment.service.js` | Logic nghiệp vụ thanh toán | `createOrder()`, `processPaymentWebhook()` |
| `src/services/download.service.js` | Quản lý task download | `createDownloadTasks()`, `processOrder()` |
| `src/workers/download.worker.js` | Node.js worker (đăng ký) | `processTask()` - Đăng ký user vào Udemy |
| `src/controllers/webhook.controller.js` | Webhook hoàn tất | `finalizeDownload()` - Được gọi bởi Python |
| `src/services/webhook.service.js` | Logic nghiệp vụ webhook | Cấp quyền Drive, gửi email |
| `src/utils/drive.util.js` | Google Drive API | `findFolderByName()`, `grantReadAccess()` |

### Python Worker

| File | Mục Đích | Hàm Chính |
|------|----------|-----------|
| `udemy_dl/worker.py` | Vòng lặp worker chính | `main()` - Poll DB, download khóa học |
| `udemy_dl/main.py` | Udemy downloader | Command-line tool để download |
| `udemy_dl/utils.py` | Tiện ích hỗ trợ | Phân tích khóa học, xử lý URL |

---

## 🔑 Biến Môi Trường

### Yêu Cầu Trong `.env`

#### Biến Node.js
```bash
# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=database_name

# Cổng Thanh Toán
SEPAY_API_KEY=your_sepay_key

# Dịch Vụ Email
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password

# Bảo Mật
API_SECRET_KEY=your_secret_key_2025

# Google Drive
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

#### Biến Python (Cùng file `.env`)
```bash
# Cấu Hình Database Chung
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=database_name

# Xác Thực Udemy
UDEMY_TOKEN=your_bearer_token

# Xác Thực Webhook
API_SECRET_KEY=your_secret_key_2025
```

---

## 📡 API Endpoint

### Endpoint Công Khai

```
POST /api/v1/payment/create-order
  Body: { email, courses[] }
  Response: { orderCode, qrCodeUrl, ... }

GET /api/v1/payment/check-status/:orderCode
  Response: { status: 'pending'|'paid' }
```

### Endpoint Webhook (Nội Bộ)

```
POST /api/v1/payment/webhook
  Headers: Authorization: Apikey ${SEPAY_API_KEY}
  Body: { code, transferAmount, ... }
  Caller: Cổng Thanh Toán SePay

POST /api/v1/webhook/finalize
  Body: { secret_key, task_id, folder_name }
  Caller: Python Worker
```

---

## 🗄️ Cấu Trúc Database

### Bảng `orders`
```sql
id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY
order_code      VARCHAR(50) UNIQUE NOT NULL  -- vd: "DH123456"
user_email      VARCHAR(255) NOT NULL
total_amount    DECIMAL(15,0) NOT NULL
payment_status  ENUM('pending','paid','cancelled','refunded')
payment_gateway_data JSON
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

### Bảng `download_tasks`
```sql
id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY
order_id        INT UNSIGNED (FK → orders.id)
email           VARCHAR(255) NOT NULL
phone_number    VARCHAR(20)
course_url      TEXT NOT NULL
title           VARCHAR(255)
price           DECIMAL(15,0)
status          ENUM('paid','pending','processing','enrolled','completed','failed')
drive_link      TEXT
retry_count     INT DEFAULT 0
error_log       TEXT
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

---

## 🔄 Quy Trình Từng Bước

### Giai Đoạn 1: Tạo Đơn Hàng
```
1. Khách hàng gửi khóa học
2. Node.js tạo Order (status: pending)
3. Node.js tạo DownloadTasks (status: paid)
4. Trả về mã QR cho khách hàng
```

### Giai Đoạn 2: Xác Nhận Thanh Toán
```
5. Khách hàng thanh toán qua ứng dụng banking
6. SePay gửi webhook đến Node.js
7. Node.js xác minh số tiền thanh toán
8. Cập nhật Order.payment_status = 'paid'
9. Cập nhật DownloadTasks.status = 'processing'
```

### Giai Đoạn 3: Đăng Ký (Node.js Worker)
```
10. downloadWorker.processTask() được gọi
11. Đăng ký khách hàng vào khóa học Udemy (qua API)
12. Cập nhật DownloadTasks.status = 'enrolled'
```

### Giai Đoạn 4: Download (Python Worker)
```
13. Python poll tìm task với status='enrolled'
14. Cập nhật status='processing' (claim task)
15. Chạy main.py để download khóa học
16. Upload lên Google Drive qua rclone
17. Cập nhật DB status='completed'
```

### Giai Đoạn 5: Hoàn Tất (Python → Node.js)
```
18. Python gọi /api/v1/webhook/finalize
19. Node.js tìm folder Drive (retry 10 lần)
20. Cấp quyền read cho email khách hàng
21. Cập nhật DownloadTasks.driver_url
22. Gửi email với link Drive cho khách hàng
```

---

## ⚡ Lệnh Thường Dùng

### Khởi Động Python Worker
```bash
cd /root/server/udemy_dl
python3 worker.py
```

### Kiểm Tra Trạng Thái Worker
```bash
# Kiểm tra đang chạy không
ps aux | grep worker.py

# Xem log (nếu dùng systemd)
journalctl -u udemy-worker.service -f
```

### Truy Vấn Database Thủ Công

```sql
-- Kiểm tra đơn hàng pending
SELECT * FROM orders WHERE payment_status = 'pending';

-- Kiểm tra task đang hoạt động
SELECT id, email, status, course_url 
FROM download_tasks 
WHERE status IN ('processing', 'enrolled') 
ORDER BY created_at;

-- Reset task bị kẹt
UPDATE download_tasks 
SET status = 'enrolled' 
WHERE status = 'processing' AND updated_at < NOW() - INTERVAL 2 HOUR;

-- Thống kê task thất bại
SELECT status, COUNT(*) 
FROM download_tasks 
GROUP BY status;
```

### Lệnh Rclone

```bash
# Liệt kê remote drive
rclone listremotes

# Kiểm tra đích upload
rclone ls gdrive:UdemyCourses/download_khoahoc

# Upload thủ công
rclone move ./Staging_Download/Course_Name gdrive:UdemyCourses/download_khoahoc/Course_Name
```

---

## 🐛 Khắc Phục Sự Cố

### Python Worker Không Xử Lý Task

**Triệu Chứng:** Task bị kẹt ở trạng thái 'enrolled'

**Kiểm Tra:**
```bash
# Worker có đang chạy không?
ps aux | grep worker.py

# Kiểm tra log worker
tail -f /var/log/udemy-worker.log

# Kiểm tra kết nối database
mysql -u root -p -e "SELECT 1"
```

**Sửa:**
```bash
# Khởi động lại worker
pkill -f worker.py
cd /root/server/udemy_dl && python3 worker.py &
```

---

### Download Thất Bại Với "No bearer token"

**Triệu Chứng:** Python worker báo lỗi: "No bearer token was provided"

**Kiểm Tra:**
```bash
# UDEMY_TOKEN có trong .env không?
grep UDEMY_TOKEN /root/server/.env

# Test token hợp lệ
curl -H "Authorization: Bearer ${UDEMY_TOKEN}" \
  https://www.udemy.com/api-2.0/users/me/
```

**Sửa:**
```bash
# Cập nhật .env với token mới
echo "UDEMY_TOKEN=your_new_token" >> /root/server/.env

# Khởi động lại worker
pkill -f worker.py
cd /root/server/udemy_dl && python3 worker.py &
```

---

### Upload Drive Thất Bại

**Triệu Chứng:** "rclone: command not found" hoặc upload timeout

**Kiểm Tra:**
```bash
# Rclone có cài đặt không?
which rclone

# Test cấu hình rclone
rclone config show gdrive

# Test kết nối
rclone lsd gdrive:
```

**Sửa:**
```bash
# Cài đặt rclone
curl https://rclone.org/install.sh | sudo bash

# Cấu hình rclone
rclone config
# Chọn: Google Drive, đặt tên 'gdrive'
```

---

### Webhook Không Nhận Được Gọi

**Triệu Chứng:** Không có email được gửi sau khi download hoàn tất

**Kiểm Tra:**
```bash
# Kiểm tra log Node.js server
pm2 logs server

# Test webhook thủ công
curl -X POST http://localhost:3000/api/v1/webhook/finalize \
  -H "Content-Type: application/json" \
  -d '{
    "secret_key": "your_secret",
    "task_id": 1,
    "folder_name": "Test Course"
  }'
```

**Sửa:**
```bash
# Kiểm tra API_SECRET_KEY khớp trong .env
grep API_SECRET_KEY /root/server/.env

# Kiểm tra firewall
sudo ufw allow 3000/tcp
```

---

## 📞 Checklist Giám Sát

### Kiểm Tra Hàng Ngày
- [ ] Python worker đang chạy (`ps aux | grep worker.py`)
- [ ] Không có task kẹt ở 'processing' > 4 giờ
- [ ] Node.js server đang phản hồi (`curl localhost:3000`)
- [ ] Dung lượng đĩa > 20% trống (`df -h`)

### Kiểm Tra Hàng Tuần
- [ ] Database backup tồn tại
- [ ] Task thất bại < 5% tổng số
- [ ] Dịch vụ email hoạt động (test gửi)
- [ ] Dung lượng Drive < 80% đã dùng

---

## 🔐 Ghi Chú Bảo Mật

1. **Không bao giờ commit `.env` vào git**
   ```bash
   git update-index --assume-unchanged .env
   ```

2. **Xoay API_SECRET_KEY mỗi quý**
   ```bash
   # Tạo key mới
   openssl rand -hex 32
   # Cập nhật trong .env và khởi động lại dịch vụ
   ```

3. **Giới hạn quyền database user**
   ```sql
   GRANT SELECT, UPDATE ON database.download_tasks TO 'worker'@'%';
   ```

4. **Giám sát truy cập trái phép**
   ```bash
   # Kiểm tra login thất bại
   grep "Failed" /var/log/auth.log
   ```

---

## 📚 Tài Liệu Liên Quan

- Phân Tích Đầy Đủ: `DOWNLOAD_WORKFLOW_ANALYSIS_VI.md`
- Tài Liệu API: `postman/README.md`
- Tóm Tắt Triển Khai: `IMPLEMENTATION_SUMMARY.md`

---

**Cập Nhật Lần Cuối:** 12 Tháng 1, 2026  
**Phiên Bản:** 1.0  
**Người Duy Trì:** Quản Trị Viên Hệ Thống
