# 📊 Phân Tích Logs PM2 - Ngày 13/01/2026

## 🔴 **LỖI NGHIÊM TRỌNG - HÔM NAY**

### **Task 28 - Download Failed**

**Thời gian:** 08:56:36 → 08:57:29 (53 giây, retry 3 lần)

**Chi tiết lỗi:**
```
CRITICAL: Failed to find the course, are you enrolled?
Course URL: https://samsungu.udemy.com/course/tu-ong-hoa-cong-viec-bang-ai-agent-va-n8n/
Email: 19d140071@gmail.com
Task ID: 28
Order ID: 27
Order Code: DH357487
```

**Timeline:**
- `08:56:36` - Order DH357487 được thanh toán thành công qua SePay webhook
- `08:56:36` - Task 28 được push vào Redis queue
- `08:56:36` - Worker #2 bắt đầu xử lý
- `08:56:41` - **Attempt 1/3 FAILED** - Exit code 1
- `08:57:05` - **Attempt 2/3 FAILED** - Exit code 1  
- `08:57:29` - **Attempt 3/3 FAILED** - Exit code 1
- `08:57:29` - Task 28 status → `failed` trong database

**Lý do thất bại:**
```
[_extract_course_info:1045] CRITICAL: Failed to find the course, are you enrolled?
```

---

## 🔍 **NGUYÊN NHÂN**

### **Vấn đề chính: Account Udemy không được enroll vào khóa học**

Có 4 nguyên nhân có thể:

1. ⚠️ **Account chưa được enroll** (CÓ KHẢ NĂNG CAO NHẤT)
   - Khóa học "Tự động hóa công việc bằng AI Agent và N8N" chưa có trong library của account `samsungu`
   - Cần kiểm tra: Account có được thêm vào khóa học sau khi thanh toán không?

2. ⚠️ **Session/Cookie hết hạn**
   - Downloader sử dụng saved session từ file `saved/`
   - Session có thể đã hết hạn sau một thời gian

3. ⚠️ **Course URL không hợp lệ**
   - URL có thể bị typo hoặc khóa học đã bị xóa/unpublish

4. ⚠️ **Account bị giới hạn hoặc khóa**
   - Udemy có thể phát hiện bot và giới hạn account

---

## 🟡 **CÁC LỖI PHỤ - NGÀY HÔM QUA (12/01/2026)**

### 1. **Lỗi Database Migration** 
```
ERROR: Can't DROP FOREIGN KEY `download_tasks_ibfk_1`; check that it exists
Thời gian: 16:23:52, 20:08:36
```
- Foreign key không tồn tại khi server khởi động
- Có thể do migration chưa được chạy đúng thứ tự

### 2. **Lỗi Schema Database**
```
ERROR: Unknown column 'driver_url' in 'SELECT'
Endpoint: POST /api/v1/webhook/finalize
Thời gian: 16:30:04
```
- Cột `driver_url` không tồn tại trong table `download_tasks`
- Code đang query cột này nhưng chưa được tạo trong database

### 3. **Lỗi Crawl Udemy - 502 Bad Gateway**
```
ERROR: Failed to crawl course: Request failed with status code 502
Thời gian: 20:27:14
```
- Server Udemy trả về lỗi 502
- Có thể do Udemy overload hoặc maintenance

### 4. **Test Task Failed**
```
Task 99999 FAILED - Failed to find the course, are you enrolled?
Thời gian: 16:26:45 - 16:27:33
```
- Test task với ID 99999 không có khóa học thật nên thất bại
- Đây là test task nên không ảnh hưởng

---

## ✅ **TASKS THÀNH CÔNG**

Hôm qua có **9 tasks download thành công:**
- Task 19, 20, 21, 22, 23, 24, 25, 26, 27 ✓

---

## 🔧 **KHUYẾN NGHỊ SỬA LỖI**

### **Ưu tiên 1: Fix Task 28** ⭐⭐⭐

#### Bước 1: Kiểm tra enrollment
```bash
# Kiểm tra xem account có được enroll chưa
cd /root/server/udemy_dl
python3 main.py -c https://samsungu.udemy.com/course/tu-ong-hoa-cong-viec-bang-ai-agent-va-n8n/ --list-lectures
```

#### Bước 2: Nếu chưa enroll - Cần enroll account vào khóa học
```
Có 2 cách:
1. Dùng email 19d140071@gmail.com để mua/enroll khóa học
2. Thêm account samsungu vào khóa học (nếu là course của mình)
```

#### Bước 3: Nếu đã enroll - Refresh session
```bash
# Xóa session cũ
rm -rf /root/server/udemy_dl/saved/*

# Login lại để tạo session mới
cd /root/server/udemy_dl
python3 main.py --login
```

#### Bước 4: Retry Task 28
```bash
# Cách 1: Push lại vào queue
cd /root/server
node scripts/retry_failed_task.js 28

# Cách 2: Download manual để test
cd /root/server/udemy_dl
python3 main.py -c https://samsungu.udemy.com/course/tu-ong-hoa-cong-viec-bang-ai-agent-va-n8n/ -o Test_Manual -q 720
```

---

### **Ưu tiên 2: Fix Database Issues** ⭐⭐

#### Fix 1: Foreign Key Error
```sql
-- Kiểm tra foreign key tồn tại
SHOW CREATE TABLE download_tasks;

-- Nếu cần thêm lại
ALTER TABLE download_tasks 
ADD CONSTRAINT download_tasks_ibfk_1 
FOREIGN KEY (order_id) REFERENCES orders(id);
```

#### Fix 2: Missing Column `driver_url`
```sql
-- Thêm cột driver_url vào table
ALTER TABLE download_tasks 
ADD COLUMN driver_url VARCHAR(500) AFTER course_url;

-- Hoặc check migration file và chạy lại
```

---

### **Ưu tiên 3: Monitor & Logging** ⭐

#### Add better error logging
```javascript
// Trong webhook.service.js
try {
  await downloadTask.findByPk(taskId);
} catch (error) {
  logger.error('Database query failed', {
    error: error.message,
    stack: error.stack,
    query: 'findByPk',
    taskId
  });
}
```

---

## 📈 **TÌNH TRẠNG HỆ THỐNG**

### Backend Server
- ✅ Running (port unknown)
- ⚠️ Database migration issues
- ⚠️ Schema mismatch (driver_url column)

### Worker Queue
- ✅ 5 workers running (#1-#5)
- ✅ Connected to Redis localhost:6379
- ✅ Success rate: 9/11 tasks (81.8%)
- ⚠️ 2 failed tasks (99999, 28)

### Udemy Downloader
- ✅ Python3 working
- ⚠️ Keyfile not found (encryption warning)
- ⚠️ Session might be expired

---

## 🎯 **KẾT LUẬN**

### Lỗi chính hôm nay:
**Task 28 thất bại vì account Udemy chưa được enroll vào khóa học "Tự động hóa công việc bằng AI Agent và N8N"**

### Hành động cần làm ngay:
1. ✅ Kiểm tra xem account `samsungu` đã enroll khóa học chưa
2. ✅ Nếu chưa → Enroll account vào khóa học
3. ✅ Nếu đã enroll → Refresh session/cookie
4. ✅ Retry Task 28

### Hành động dài hạn:
1. Fix database schema (add driver_url column)
2. Fix foreign key migration
3. Add auto-enroll workflow sau khi payment
4. Add better error messages và retry logic

---

**Generated:** 2026-01-13 09:00:00 +07:00  
**Analyzed by:** AI Assistant  
**Log files:** backend-error.log, backend-out.log, worker-error.log, worker-out.log
