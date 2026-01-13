# Tóm Tắt Triển Khai Luồng Mua Khóa Học

## Tổng Quan

Đã triển khai đầy đủ luồng mua khóa học theo yêu cầu với 4 bước chính.

---

## Các Thay Đổi Đã Thực Hiện

### Bước 1: User Nhập Email và List URLs → Crawl Data

**File:** `src/controllers/infoCourse.controller.js`

**Thay đổi:**
- Thêm tính toán tổng tiền cho các khóa học hợp lệ
- Trả về `totalAmount` và `validCourseCount` trong response

**Response mới:**
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "url": "https://udemy.com/course/example1",
      "title": "Course Title 1",
      "image": "https://...",
      "price": 50000,
      "courseId": 123456
    }
  ],
  "totalAmount": 50000,
  "validCourseCount": 1
}
```

---

### Bước 2: User Click Thanh Toán → Tạo Order + QR Code + Download Tasks

**File:** `src/services/payment.service.js`

**Thay đổi chính:**
1. ✅ Order được tạo với `payment_status: 'paid'` ngay từ đầu (không phải 'pending')
2. ✅ Tạo download tasks tự động khi tạo order
3. ✅ Generate QR code sử dụng `generateVietQR()`
4. ✅ Trả về đầy đủ thông tin: order, QR code, courses, download tasks

**Response:**
```json
{
  "success": true,
  "orderId": 1,
  "orderCode": "DH000001",
  "totalAmount": 50000,
  "paymentStatus": "paid",
  "qrCodeUrl": "https://img.vietqr.io/image/...",
  "courses": [
    {
      "url": "https://udemy.com/course/example1",
      "title": "Course Title 1",
      "price": 50000,
      "courseId": 123456
    }
  ],
  "downloadTasks": [
    {
      "id": 1,
      "course_url": "https://samsungu.udemy.com/course/example1",
      "title": "Course Title 1",
      "price": 50000,
      "status": "pending"
    }
  ]
}
```

**Lưu ý quan trọng:**
- Order được tạo với status `'paid'` ngay từ đầu
- Download tasks được tạo với status `'pending'` và sẽ được worker xử lý ngay vì order đã paid
- QR code được generate với `order_code` làm nội dung chuyển khoản

---

### Bước 3: Khi Thanh Toán Thành Công → Cập Nhật Trạng Thái

**File:** `src/services/payment.service.js` - `processPaymentWebhook()`

**Thay đổi:**
- Webhook xử lý idempotent: nếu order đã paid, trả về success (không báo lỗi)
- Vẫn validate amount và update payment_gateway_data nếu cần

**Logic:**
1. Tìm order theo `order_code` trong `transferContent`
2. Nếu đã paid → trả về success (idempotent)
3. Nếu chưa paid → update thành paid
4. Validate amount (cho phép sai số nhỏ)

---

### Bước 4: Worker Xử Lý Download

**File:** `src/workers/download.worker.js`

**Logic hiện tại:**
- Worker kiểm tra `payment_status` của order trước khi xử lý
- Nếu order chưa paid → skip processing
- Nếu order đã paid → tiếp tục xử lý (enroll, download, etc.)

**Vì order được tạo với status 'paid' ngay từ đầu:**
- Worker sẽ xử lý download tasks ngay sau khi được tạo
- Không cần chờ webhook thanh toán

---

## Luồng Hoàn Chỉnh

```
1. User nhập email + URLs
   → POST /api/v1/info-course/get-course-info
   → Response: courses info + totalAmount

2. User click thanh toán
   → POST /api/v1/payment/create-order
   → Tạo Order (status: 'paid')
   → Tạo Download Tasks (status: 'pending')
   → Generate QR Code
   → Response: order + qrCode + courses + downloadTasks
   → Worker tự động bắt đầu xử lý (vì order đã paid)

3. Payment gateway gửi webhook (optional - idempotent)
   → POST /api/v1/payment/webhook
   → Kiểm tra order đã paid → trả về success
   → (Không cần update vì đã paid từ đầu)

4. Worker xử lý download
   → Kiểm tra order.payment_status === 'paid' ✅
   → Enroll vào Udemy
   → Download course
   → Upload lên Google Drive
   → Gửi email thông báo
```

---

## Các File Đã Cập Nhật

1. ✅ `src/controllers/infoCourse.controller.js`
   - Thêm `totalAmount` và `validCourseCount` vào response

2. ✅ `src/services/payment.service.js`
   - Tạo order với `payment_status: 'paid'`
   - Tích hợp tạo download tasks
   - Generate QR code
   - Trả về đầy đủ thông tin

3. ✅ `src/services/payment.service.js` - `processPaymentWebhook()`
   - Xử lý idempotent cho order đã paid

4. ✅ `src/workers/download.worker.js` (đã có sẵn)
   - Kiểm tra payment_status trước khi xử lý

---

## Lưu Ý Quan Trọng

### 1. Order Status
- Order được tạo với status `'paid'` ngay từ đầu
- Điều này có nghĩa là khi user click thanh toán, hệ thống coi như đã thanh toán
- Webhook vẫn có thể được gọi để xác nhận, nhưng sẽ là idempotent

### 2. Download Tasks
- Tasks được tạo với status `'pending'`
- Worker sẽ tự động xử lý vì order đã paid
- Tasks sẽ được process ngay sau khi tạo

### 3. QR Code
- QR code được generate với `order_code` làm nội dung chuyển khoản
- User có thể quét QR để thanh toán (nếu cần)
- Webhook sẽ xác nhận thanh toán (idempotent)

### 4. Worker Processing
- Worker kiểm tra `payment_status` trước khi xử lý
- Vì order đã paid từ đầu, worker sẽ xử lý ngay
- Không cần chờ webhook

---

## Testing Checklist

- [ ] Test bước 1: Crawl course info và trả về totalAmount
- [ ] Test bước 2: Tạo order với status 'paid' và download tasks
- [ ] Test QR code generation
- [ ] Test response format đầy đủ
- [ ] Test webhook idempotent (order đã paid)
- [ ] Test worker xử lý tasks khi order đã paid
- [ ] Test toàn bộ flow end-to-end

---

## API Endpoints

### 1. Get Course Info
```
POST /api/v1/info-course/get-course-info
Body: { "urls": ["..."] }
Response: { success, results, totalAmount, validCourseCount }
```

### 2. Create Order
```
POST /api/v1/payment/create-order
Body: { "email": "...", "courses": [...] }
Response: { success, orderId, orderCode, totalAmount, paymentStatus, qrCodeUrl, courses, downloadTasks }
```

### 3. Payment Webhook
```
POST /api/v1/payment/webhook
Body: { "transferContent": "DH000001", "transferAmount": 50000 }
Response: { success: true }
```

---

## Kết Luận

Đã triển khai đầy đủ luồng mua khóa học theo yêu cầu:
- ✅ Bước 1: Crawl và trả về totalAmount
- ✅ Bước 2: Tạo order với status 'paid', QR code, download tasks
- ✅ Bước 3: Webhook xử lý idempotent
- ✅ Bước 4: Worker xử lý download (đã có sẵn logic)

Tất cả các thay đổi đã được thực hiện và sẵn sàng để test.
