# PHÂN TÍCH LUỒNG SERVER TỪ A-Z

## 📋 TỔNG QUAN HỆ THỐNG

Hệ thống GetCourses là một nền tảng tải khóa học online với luồng xử lý phức tạp từ thanh toán đến giao hàng.

---

## 🔄 LUỒNG XỬ LÝ CHÍNH (A-Z)

### **BƯỚC 1: KHỞI ĐỘNG SERVER** (`server.js`)

**File**: `/root/project/server/server.js`

**Luồng khởi động**:
1. **Load Environment Variables** (`.env`)
   - Đọc các biến môi trường: PORT, CORS_ORIGIN, NODE_ENV, etc.

2. **Cấu hình CORS (Cross-Origin Resource Sharing)**
   - Production: Chỉ cho phép domains cụ thể (whitelist)
   - Development: Cho phép localhost và wildcard
   - Xử lý đặc biệt: Cho phép requests không có origin (health checks, monitoring)

3. **Cấu hình Trust Proxy**
   - Bật trust proxy để nhận đúng IP client từ X-Forwarded-For header
   - Cần thiết khi đứng sau nginx/Cloudflare

4. **Security Middleware**
   - **Helmet**: Bảo vệ HTTP headers (XSS, clickjacking, MIME sniffing)
   - **Rate Limiting**: 
     - General API: 1000 requests/15 phút
     - Download endpoints: 100 requests/1 giờ

5. **Kết nối Database**
   - Test connection với Sequelize
   - Sync models (nếu ENABLE_DB_SYNC=true)

6. **Khởi tạo WebSocket**
   - Socket.IO cho real-time progress updates
   - CORS cho phép frontend domain

7. **Auto-Recovery**
   - Tự động recover các tasks bị stuck (status = 'processing' quá lâu)
   - Chạy sau 50 giây để đợi services sẵn sàng

8. **Start HTTP Server**
   - Lắng nghe trên port 3000 (hoặc PORT từ env)
   - Bind to 0.0.0.0 để accept connections từ mọi interface

---

### **BƯỚC 2: TẠO ĐƠN HÀNG** (`POST /api/v1/payment/create-order`)

**File**: 
- Route: `src/routes/payment.routes.js`
- Controller: `src/controllers/payment.controller.js`
- Service: `src/services/payment.service.js`

**Luồng xử lý**:

1. **Validation** (`validateCreateOrder` middleware)
   - Validate email format
   - Validate courses array không rỗng
   - Validate mỗi course có url hợp lệ

2. **Tính giá đơn hàng** (`calculateOrderPrice`)
   - Lọc courses hợp lệ
   - Áp dụng combo pricing:
     - 1 khóa: 50,000 VNĐ
     - 5 khóa: 199,000 VNĐ (~40k/khóa)
     - 10 khóa: 299,000 VNĐ (~30k/khóa)

3. **Tạo Order trong Database**
   - Tạo order với `order_code = 'TEMP'` tạm thời
   - Lấy auto-incremented ID
   - Generate `order_code` theo format: `DH000001`, `DH000002`, ...
   - Update lại order với `order_code` thực tế

4. **Tạo Download Tasks**
   - Gọi `downloadService.createDownloadTasks()`
   - Mỗi course tạo 1 task với status = 'pending'
   - Tasks chưa được xử lý, đợi thanh toán

5. **Generate QR Code & Bank Info**
   - Tạo VietQR code cho thanh toán
   - Trả về thông tin ngân hàng

6. **Response**
   ```json
   {
     "success": true,
     "orderId": 123,
     "orderCode": "DH000123",
     "totalAmount": 199000,
     "qrCode": "data:image/png;base64,...",
     "bankInfo": {...}
   }
   ```

---

### **BƯỚC 3: THANH TOÁN** (`POST /api/v1/payment/webhook`)

**File**: `src/services/payment.service.js` - `handleWebhook()`

**Luồng xử lý**:

1. **Validate Webhook**
   - Kiểm tra signature từ payment gateway
   - Validate amount (cho phép sai lệch 1000 VNĐ)

2. **TRANSACTION START** (Database Transaction)
   ```javascript
   await sequelize.transaction(async (t) => {
     // Update Order
     await order.update({
       payment_status: 'paid',
       order_status: 'processing'
     }, { transaction: t });
     
     // Update Tasks (chỉ tasks có status = 'pending')
     await DownloadTask.update({
       status: 'processing'
     }, {
       where: {
         order_id: orderId,
         status: 'pending'
       },
       transaction: t
     });
   });
   ```

3. **COMMIT TRANSACTION**
   - Đảm bảo atomicity: Hoặc cả order và tasks đều update, hoặc không update gì

4. **Gửi Email Xác Nhận Thanh Toán**
   - `sendPaymentSuccessEmail()` - Email thông báo thanh toán thành công

5. **PHASE 2: Enrollment & Queue** (KHÔNG trong transaction)
   - **Enroll từng course**:
     - Gọi `enrollService.enrollCourse()` cho mỗi task
     - Update task status: 'processing' → 'enrolled'
     - Nếu enroll fail, task vẫn giữ status 'processing'
   
   - **Push vào Redis Queue**:
     - Chỉ push tasks đã enrolled thành công
     - Sử dụng RQ (Redis Queue) với Python worker

6. **Response**
   ```json
   {
     "success": true,
     "orderId": 123,
     "orderCode": "DH000123",
     "paymentStatus": "paid",
     "tasksUpdated": 3,
     "tasksEnrolled": 3,
     "tasksQueued": 3
   }
   ```

**⚠️ LƯU Ý QUAN TRỌNG**:
- Transaction chỉ bao gồm update payment status
- Enrollment failures KHÔNG rollback payment (đã paid rồi)
- Redis queue failures KHÔNG rollback payment (có thể requeue sau)

---

### **BƯỚC 4: ENROLLMENT** (`enrollService.enrollCourse()`)

**File**: `src/services/enroll.service.js`

**Luồng xử lý**:

1. **Lấy Course Info**
   - Scrape Udemy page để lấy `courseId`
   - Sử dụng `got-scraping` với anti-bot headers
   - Retry 3 lần nếu fail

2. **Enroll Request**
   - Gửi GET request đến: `https://samsungu.udemy.com/api-2.0/users/me/subscribed-courses/{courseId}/`
   - Sử dụng cookie từ `cookies.txt`
   - Nếu response 200 → Enroll thành công

3. **Verify Enrollment**
   - Retry 10 lần, mỗi lần đợi 500ms
   - Check subscription status
   - Nếu verify thành công → Update task status = 'enrolled'

4. **Update Task**
   ```javascript
   await task.update({
     status: 'enrolled',
     course_id: courseId,
     title: courseTitle
   });
   ```

---

### **BƯỚC 5: QUEUE JOB** (`queues/download.queue.js`)

**File**: `src/queues/download.queue.js`

**Luồng xử lý**:

1. **Add Job to Redis Queue**
   ```javascript
   await queue.add('download', {
     taskId: task.id,
     email: task.email,
     courseUrl: task.course_url,
     orderId: task.order_id
   });
   ```

2. **Python Worker Nhận Job**
   - File: `udemy_dl/worker_rq.py`
   - Worker chạy độc lập, lấy jobs từ Redis queue

---

### **BƯỚC 6: DOWNLOAD & UPLOAD** (Python Worker)

**File**: `udemy_dl/worker_rq.py` - `process_download()`

**Luồng xử lý**:

1. **Validate Input**
   - Kiểm tra taskId, email, courseUrl
   - Sanitize URL để tránh command injection

2. **Create Sandbox Directory**
   - Tạo folder: `Staging_Download/Task_{taskId}/`
   - Mỗi task có folder riêng để tránh conflict

3. **Emit Progress (Redis Pub/Sub)**
   - Publish progress updates qua Redis channels:
     - `task:{taskId}:progress` - Progress percentage
     - `task:{taskId}:status` - Status changes
     - `order:{orderId}:progress` - Order-level progress

4. **Download Course**
   - Chạy Python script: `main.py` với subprocess
   - Download video, captions, assets, quizzes
   - Quality: 720p (có thể config)

5. **Upload to Google Drive**
   - Sử dụng `rclone` để upload
   - Upload vào folder: `Staging_Download/Task_{taskId}/`
   - Lấy `folder_id` từ Google Drive

6. **Call Finalize Webhook**
   - POST đến: `https://api.getcourses.net/api/v1/webhook/finalize`
   - Payload: `{ task_id, folder_name, secret_key, timestamp }`
   - Auth: HMAC-SHA256 signature

---

### **BƯỚC 7: FINALIZE DOWNLOAD** (`POST /api/v1/webhook/finalize`)

**File**: `src/services/webhook.service.js` - `finalizeDownload()`

**Luồng xử lý**:

1. **Validate Signature**
   - Verify HMAC-SHA256 signature
   - Check timestamp (không quá 5 phút)

2. **Find Task**
   - Tìm task theo `task_id`
   - Verify task status = 'downloading' hoặc 'enrolled'

3. **Find Google Drive Folder**
   - Retry 10 lần, mỗi lần đợi 3 giây
   - Tìm folder theo `folder_name` trong Google Drive
   - Lấy `folder_id` và `folder_url`

4. **Grant Read Access**
   - Gọi Google Drive API để grant read access cho user email
   - User có thể xem và download files

5. **Update Task**
   ```javascript
   await task.update({
     status: 'completed',
     drive_link: folderUrl,
     drive_folder_id: folderId,
     completed_at: new Date()
   });
   ```

6. **Send Completion Email**
   - Gửi email với link Google Drive
   - Email chứa danh sách tất cả courses đã completed trong order

7. **Emit Progress Events**
   - Publish completion event qua Redis
   - WebSocket clients nhận được notification

---

### **BƯỚC 8: REAL-TIME PROGRESS** (WebSocket)

**File**: `src/websocket/progress.server.js`

**Luồng xử lý**:

1. **Client Connection**
   - Client connect đến: `wss://api.getcourses.net/socket.io`
   - Authenticate (optional, hiện tại allow all)

2. **Subscribe to Order/Task**
   - Client gửi: `{ orderId: 123 }` hoặc `{ taskId: 456 }`
   - Server join client vào room: `order:123` hoặc `task:456`

3. **Redis Pub/Sub Bridge**
   - Server subscribe Redis channels:
     - `task:*:progress`
     - `task:*:status`
     - `order:*:progress`
     - `order:*:complete`

4. **Broadcast to WebSocket**
   - Khi nhận message từ Redis → Broadcast đến room tương ứng
   - Client nhận real-time updates

---

## 🔐 BẢO MẬT

### **Signature Verification**
- Download endpoint: HMAC-SHA256(`order_id + email + timestamp`, SECRET_KEY)
- Webhook endpoint: HMAC-SHA256(`payload + timestamp`, API_SECRET_KEY)

### **Rate Limiting**
- General API: 1000 requests/15 phút
- Download endpoints: 100 requests/1 giờ

### **Input Validation**
- URL validation: Chỉ cho phép Udemy URLs
- Email validation: Format check
- Command injection prevention: Sanitize inputs trước khi truyền vào subprocess

---

## 📊 DATABASE MODELS

### **Order**
- `id`: Auto-increment
- `order_code`: Format DH000001
- `user_email`: Customer email
- `total_amount`: Tổng tiền
- `payment_status`: 'pending' | 'paid' | 'failed'
- `order_status`: 'pending' | 'processing' | 'completed' | 'failed'

### **DownloadTask**
- `id`: Auto-increment
- `order_id`: Foreign key to Order
- `email`: Customer email
- `course_url`: Udemy course URL
- `status`: 'pending' | 'processing' | 'enrolled' | 'downloading' | 'completed' | 'failed'
- `drive_link`: Google Drive folder URL
- `drive_folder_id`: Google Drive folder ID

---

## 🔄 ERROR HANDLING

### **Retry Logic**
- Enrollment: Retry 10 lần, 500ms mỗi lần
- Course info scraping: Retry 3 lần, 2s/4s/6s
- Google Drive folder lookup: Retry 10 lần, 3s mỗi lần

### **Task Recovery**
- Auto-recovery chạy khi server start
- Tìm tasks có status = 'processing' quá 2 giờ
- Re-enroll và re-queue

---

## 📝 LOGGING

### **Winston Logger**
- File rotation: Daily, 14 days history
- Separate error logs
- Sanitize sensitive data

### **Lifecycle Logger**
- Log các events quan trọng: Order created, Payment received, Task completed
- Structured logging với metadata

---

## 🚀 DEPLOYMENT

### **PM2 Configuration**
- `server`: 2 instances (cluster mode)
- `client`: 1 instance (fork mode, port 4000)
- `workers`: 2 instances (Python workers)

### **Nginx Configuration**
- Frontend: `getcourses.net` → `localhost:4000`
- API: `api.getcourses.net` → `localhost:3000`
- WebSocket: `/socket.io/` → Proxy với upgrade headers

---

## 📌 TÓM TẮT LUỒNG

```
1. User tạo đơn hàng → Order created (pending)
2. User thanh toán → Payment webhook → Order paid, Tasks processing
3. Enroll courses → Tasks enrolled
4. Queue jobs → Redis queue
5. Python worker download → Upload Google Drive
6. Finalize webhook → Grant access → Task completed
7. Send email → User nhận link Google Drive
```

---

## 🔍 CÁC ĐIỂM QUAN TRỌNG

1. **Transaction chỉ bao gồm payment update**, không bao gồm enrollment/queue
2. **Tasks có thể tồn tại không có order_id** (legacy support)
3. **Status flow**: pending → processing → enrolled → downloading → completed
4. **Real-time progress** qua Redis Pub/Sub + WebSocket
5. **Auto-recovery** để xử lý stuck tasks
