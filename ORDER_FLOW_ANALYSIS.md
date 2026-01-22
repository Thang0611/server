# 📋 PHÂN TÍCH LUỒNG ORDER: Từ Tạo Order đến Gửi Email Hoàn Thành

**Ngày phân tích**: 2026-01-18  
**Status**: ✅ Đã phân tích toàn bộ flow

---

## 🔄 FLOW TỔNG QUAN

```
1. CREATE ORDER (payment.service.createOrder)
   ↓
2. PAYMENT WEBHOOK (payment.service.processPaymentWebhook)
   ↓
3. ENROLL COURSES → PUSH TO REDIS QUEUE
   ↓
4. WORKER PROCESS (Python worker_rq.py)
   ↓
5. FINALIZE DOWNLOAD (webhook.service.finalizeDownload)
   ↓
6. SEND COMPLETION EMAIL (email.service.sendBatchCompletionEmail)
```

---

## 📝 CHI TIẾT TỪNG BƯỚC

### **BƯỚC 1: Tạo Order** (`POST /api/v1/payment/create-order`)

**File**: `server/src/services/payment.service.js` - `createOrder()`

**Luồng**:
1. Validate input (email, courses)
2. Tính toán giá (combo 5, combo 10, hoặc giá thường)
3. Tạo Order trong DB:
   - `order_code`: 'TEMP' → sau đó update thành `DH000001`
   - `payment_status`: `'pending'`
   - `order_status`: `'pending'` (default)
4. Tạo DownloadTasks:
   - `status`: `'pending'`
   - `order_id`: liên kết với Order
5. Generate QR code (VietQR)
6. Return order info (không bao gồm downloadTasks)

**Output**:
```json
{
  "success": true,
  "orderId": 123,
  "orderCode": "DH000123",
  "totalAmount": 10000,
  "paymentStatus": "pending",
  "qrCodeUrl": "https://...",
  "courses": [...]
}
```

**⚠️ ĐIỂM CẦN CHÚ Ý**:
- ✅ Order được tạo với `payment_status = 'pending'`
- ✅ Tasks được tạo với `status = 'pending'`
- ✅ Nếu tạo tasks fail, order vẫn được tạo (log error nhưng không throw)

---

### **BƯỚC 2: Payment Webhook** (`POST /api/v1/payment/webhook`)

**File**: `server/src/services/payment.service.js` - `processPaymentWebhook()`

**Luồng**:
1. Validate orderCode và transferAmount
2. Tìm Order theo orderCode (LOCK trong transaction)
3. Check nếu đã paid → return success (idempotent)
4. Validate amount (cho phép sai lệch 1000 VND)
5. **TRANSACTION START**:
   - Update Order: `payment_status = 'paid'`, `order_status = 'processing'`
   - Update Tasks: `status = 'processing'` (chỉ update tasks có `status = 'pending'`)
6. **COMMIT TRANSACTION**
7. Gửi payment success email (`sendPaymentSuccessEmail`)
8. **PHASE 2: Enrollment & Queue** (không trong transaction):
   - Enroll từng course → Update task `status = 'enrolled'`
   - Push tasks đã enrolled vào Redis queue

**Output**:
```json
{
  "success": true,
  "orderId": 123,
  "orderCode": "DH000123",
  "paymentStatus": "paid",
  "tasksUpdated": 3
}
```

**⚠️ ĐIỂM CẦN CHÚ Ý**:
- ✅ Transaction đảm bảo payment status update atomically
- ✅ Enrollment failures không rollback payment (đã paid rồi)
- ✅ Redis queue failures không rollback payment (có thể requeue sau)
- ⚠️ Có retry logic cho enrollment status verification (10 retries, 500ms mỗi lần)

---

### **BƯỚC 3: Worker Process** (Redis Queue → Python Worker)

**File**: `server/udemy_dl/worker_rq.py` - `process_download()`

**Luồng**:
1. Worker lấy job từ Redis queue
2. Download course từ Udemy
3. Upload lên Google Drive (sử dụng rclone)
4. Gọi webhook finalize: `POST /api/v1/webhook/finalize`

**Webhook Call** (`notify_node_webhook()`):
- URL: `https://api.khoahocgiare.info/api/v1/webhook/finalize` ⚠️ **CẦN FIX**
- Auth: HMAC-SHA256 signature + timestamp
- Payload: `{ task_id, folder_name, secret_key, timestamp }`

**⚠️ LỖI PHÁT HIỆN**:
- ❌ **Line 207**: Hardcoded URL `api.khoahocgiare.info` thay vì `api.getcourses.net`

---

### **BƯỚC 4: Finalize Download** (`POST /api/v1/webhook/finalize`)

**File**: `server/src/services/webhook.service.js` - `finalizeDownload()`

**Luồng**:
1. Validate secret key và HMAC signature
2. Tìm task theo taskId
3. Tìm folder trên Google Drive (retry 10 lần, 3s mỗi lần)
4. Grant read access cho user email
5. Update task:
   - `status = 'completed'` (nếu có drive_link)
   - `status = 'failed'` (nếu không tìm thấy folder)
   - `drive_link = folder.webViewLink`
6. **Check Order Completion**:
   - Query tất cả tasks của order
   - Nếu không còn tasks `pending/processing/enrolled` → Order hoàn thành
   - Update Order: `order_status = 'completed'`
7. **Send Batch Email**: Gọi `sendOrderCompletionNotification()`

**⚠️ ĐIỂM CẦN CHÚ Ý**:
- ✅ Chỉ mark task `completed` nếu có drive_link
- ✅ Batch email chỉ gửi 1 lần khi tất cả tasks xong
- ✅ Race condition được handle: check completion sau mỗi task update

---

### **BƯỚC 5: Send Completion Email** (`email.service.sendBatchCompletionEmail`)

**File**: `server/src/services/email.service.js` - `sendBatchCompletionEmail()`

**Luồng**:
1. Validate tasks array (phải có ít nhất 1 task)
2. Categorize tasks: successful vs failed
3. Generate HTML email với:
   - Order summary
   - Course list với download links
   - Status indicators
4. Send email via SMTP (Gmail/NodeMailer)
5. Log lifecycle event

**Email Content**:
- Subject: `Khóa học đã sẵn sàng - Đơn hàng #DH000123`
- Body: HTML với danh sách courses và download links
- Warning: Files chỉ lưu 30 ngày

**⚠️ ĐIỂM CẦN CHÚ Ý**:
- ✅ Email chỉ gửi khi có tasks
- ✅ Email bao gồm cả successful và failed tasks
- ⚠️ Email config check: Nếu `EMAIL_USER` không set thì chỉ log warning

---

## 🔍 CÁC ĐIỂM CÓ THỂ LỖI

### ❌ **LỖI 1: Hardcoded Domain trong Python Worker**

**File**: `server/udemy_dl/worker_rq.py:207`

**Vấn đề**:
```python
api_url = "https://api.khoahocgiare.info/api/v1/webhook/finalize"
```

**Impact**: Worker không thể gọi webhook finalize sau khi domain đổi sang `getcourses.net`

**Giải pháp**: 
- Option 1: Sử dụng environment variable `API_BASE_URL`
- Option 2: Hardcode thành `api.getcourses.net` (ít flexible hơn)

---

### ⚠️ **VẤN ĐỀ 2: Enrollment Status Verification Retry**

**File**: `server/src/services/payment.service.js:520-533`

**Vấn đề**: Có retry logic để verify enrollment status đã được update trong DB, nhưng có thể không đủ nếu DB chậm.

**Current**: 10 retries × 500ms = 5 seconds max

**Risk**: Nếu DB replication lag > 5s, có thể push task vào queue với status chưa được verify.

---

### ⚠️ **VẤN ĐỀ 3: Email Configuration**

**File**: `server/src/services/email.service.js:114`

**Vấn đề**: Nếu `EMAIL_USER` không được config, email sẽ không được gửi nhưng chỉ log warning.

**Impact**: Customer không nhận email hoàn thành nhưng không biết lỗi.

**Recommendation**: Nên fail fast trong development, hoặc có monitoring alert.

---

### ⚠️ **VẤN ĐỀ 4: Race Condition trong Order Completion Check**

**File**: `server/src/services/webhook.service.js:283`

**Vấn đề**: Khi nhiều tasks cùng complete đồng thời, có thể gửi nhiều completion emails.

**Current Protection**: 
- Check completion sau mỗi task update
- Nhưng không có lock mechanism

**Risk**: Nếu 2 tasks complete cùng lúc → có thể check completion đồng thời → gửi 2 emails.

**Recommendation**: Sử dụng database lock hoặc unique flag để đảm bảo chỉ gửi 1 email.

---

### ⚠️ **VẤN ĐỀ 5: Google Drive Folder Not Found**

**File**: `server/src/services/webhook.service.js:185`

**Vấn đề**: Nếu folder không tìm thấy sau 10 retries, task sẽ mark `failed` nhưng order vẫn có thể complete nếu các tasks khác xong.

**Current**: Task `failed` → Order vẫn `completed` (với một số tasks failed)

**Impact**: Customer nhận email completion nhưng thiếu một số courses.

**Note**: Đây có thể là expected behavior nếu một số courses thực sự failed.

---

## ✅ CÁC ĐIỂM HOẠT ĐỘNG TỐT

1. ✅ **Transaction Safety**: Payment status update trong transaction, đảm bảo atomic
2. ✅ **Idempotent Webhook**: Payment webhook check `already paid` trước khi process
3. ✅ **Task Status Flow**: Clear status transition `pending → processing → enrolled → completed`
4. ✅ **Error Handling**: Nhiều try-catch blocks, không crash khi lỗi non-critical
5. ✅ **Logging**: Comprehensive logging ở mọi bước
6. ✅ **Lifecycle Tracking**: Audit logs cho order lifecycle events

---

## 🧪 TEST API CHECKLIST

### Test 1: Create Order
```bash
POST /api/v1/payment/create-order
{
  "email": "test@example.com",
  "courses": [
    { "url": "https://www.udemy.com/course/test/", "title": "Test Course" }
  ]
}
```

**Expected**:
- Status 200
- Return orderCode, qrCodeUrl
- Order trong DB với `payment_status = 'pending'`
- Tasks trong DB với `status = 'pending'`

---

### Test 2: Payment Webhook
```bash
POST /api/v1/payment/webhook
Headers: Authorization: Apikey ${SEPAY_API_KEY}
{
  "code": "DH000123",
  "transferAmount": 10000,
  "gateway": "VCB"
}
```

**Expected**:
- Status 200
- Order `payment_status = 'paid'`
- Order `order_status = 'processing'`
- Tasks `status = 'processing'` hoặc `'enrolled'`
- Payment success email được gửi

---

### Test 3: Check Order Status
```bash
GET /api/v1/payment/check-status/DH000123
```

**Expected**:
- Status 200
- Return `paymentStatus`, `orderStatus`

---

### Test 4: Finalize Download Webhook
```bash
POST /api/v1/webhook/finalize
Headers: 
  X-Signature: <hmac-sha256>
  X-Timestamp: <unix-timestamp>
{
  "task_id": 123,
  "folder_name": "Test Course - Complete",
  "secret_key": "${API_SECRET_KEY}",
  "timestamp": <unix-timestamp>
}
```

**Expected**:
- Status 200
- Task `status = 'completed'` với `drive_link`
- Nếu tất cả tasks xong → Order `order_status = 'completed'`
- Completion email được gửi

---

## 🔧 FIXES CẦN THỰC HIỆN

### Fix 1: Update Python Worker API URL (CRITICAL)

**File**: `server/udemy_dl/worker_rq.py`

**Change**: Line 207
```python
# OLD
api_url = "https://api.khoahocgiare.info/api/v1/webhook/finalize"

# NEW
api_url = os.getenv('API_BASE_URL', 'https://api.getcourses.net') + "/api/v1/webhook/finalize"
```

---

## 📊 STATUS SUMMARY

| Step | Status | Issues |
|------|--------|--------|
| Create Order | ✅ OK | None |
| Payment Webhook | ✅ OK | None |
| Enrollment | ✅ OK | Minor: Retry timeout có thể không đủ |
| Queue Push | ✅ OK | None |
| Worker Process | ⚠️ ISSUE | Hardcoded domain URL |
| Finalize Webhook | ✅ OK | Minor: Race condition có thể gửi duplicate email |
| Send Email | ✅ OK | Minor: Silent fail nếu EMAIL_USER không config |

---

**Tạo bởi**: Cursor AI Assistant  
**Ngày**: 2026-01-18
