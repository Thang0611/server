# Phân Tích Luồng Mua Khóa Học

## Tổng Quan

Tài liệu này phân tích luồng mua khóa học hiện tại và các điểm cần cải thiện.

---

## Luồng Mong Muốn

### Bước 1: User Nhập Email và List URLs → Crawl Data
**Endpoint hiện tại:** `POST /api/v1/info-course/get-course-info`

**Input:**
```json
{
  "urls": [
    "https://udemy.com/course/example1",
    "https://udemy.com/course/example2"
  ]
}
```

**Output:**
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
    },
    {
      "success": false,
      "url": "https://udemy.com/course/example2",
      "message": "URL không hợp lệ",
      "price": 0
    }
  ]
}
```

**Trạng thái:** ✅ Đã implement đầy đủ
- Service: `infoCourse.service.js`
- Controller: `infoCourse.controller.js`
- Route: `infoCourse.routes.js`
- Giá mỗi khóa học: 50000 VND (đã hardcode)

---

### Bước 2: User Click Thanh Toán → Tạo Order + QR Code + Download Tasks
**Endpoint hiện tại:** `POST /api/v1/payment/create-order`

**Input mong muốn:**
```json
{
  "email": "user@example.com",
  "courses": [
    {
      "url": "https://udemy.com/course/example1",
      "title": "Course Title 1",
      "price": 50000,
      "courseId": 123456
    }
  ]
}
```

**Output mong muốn:**
```json
{
  "success": true,
  "orderId": 1,
  "orderCode": "DH000001",
  "totalAmount": 50000,
  "paymentStatus": "pending",
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

**Trạng thái hiện tại:** ⚠️ Cần cải thiện

**Vấn đề:**
1. ❌ Không tạo download tasks khi tạo order
2. ❌ Không generate QR code
3. ❌ Không trả về thông tin courses với giá tiền
4. ❌ Chỉ trả về `paymentUrl: null`

**Code hiện tại:**
- `payment.service.js` - `createOrder()` chỉ tạo order, không tạo tasks
- Không sử dụng `generateVietQR()` từ `qrGenerator.js`
- Không gọi `downloadService.createDownloadTasks()`

---

### Bước 3: Thanh Toán Thành Công → Cập Nhật Trạng Thái
**Endpoint:** `POST /api/v1/payment/webhook`

**Input:**
```json
{
  "transferContent": "DH000001",
  "transferAmount": 50000
}
```

**Xử lý:**
1. Tìm order theo `order_code` trong `transferContent`
2. Validate amount (cho phép sai số nhỏ)
3. Update `payment_status` từ `pending` → `paid`
4. Lưu `payment_gateway_data`

**Trạng thái:** ✅ Đã implement đầy đủ
- Service: `payment.service.js` - `processPaymentWebhook()`
- Controller: `payment.controller.js` - `handleWebhook()`
- Route: `payment.routes.js`

**Lưu ý:** 
- Có TODO comment về việc trigger download task creation
- Hiện tại download tasks được tạo riêng qua `/api/v1/download`

---

### Bước 4: Worker Xử Lý Download
**Trạng thái:** ⏳ User sẽ hỏi sau

**Hiện tại:**
- Worker: `download.worker.js`
- Service: `download.service.js`
- Tasks được process tự động sau khi tạo (trong `createDownloadTasks`)

---

## Cấu Trúc Database

### Bảng `orders`
```sql
- id (PK)
- order_code (unique) - Format: DH000001
- user_email
- total_amount (DECIMAL)
- payment_status (ENUM: 'pending', 'paid', 'cancelled', 'refunded')
- payment_gateway_data (JSON)
- note (TEXT)
- created_at, updated_at
```

### Bảng `download_tasks`
```sql
- id (PK)
- order_id (FK → orders.id) - nullable
- email
- phone_number (nullable)
- course_url
- title (nullable)
- price (DECIMAL)
- status (ENUM: 'pending', 'processing', 'enrolled', 'completed', 'failed')
- drive_link (nullable)
- retry_count
- error_log (nullable)
- created_at, updated_at
```

**Quan hệ:**
- `Order.hasMany(DownloadTask, { as: 'items' })`
- `DownloadTask.belongsTo(Order, { as: 'order' })`

---

## Các File Liên Quan

### Services
- ✅ `src/services/infoCourse.service.js` - Crawl course info
- ⚠️ `src/services/payment.service.js` - Cần thêm QR code và download tasks
- ✅ `src/services/download.service.js` - Tạo download tasks
- ✅ `src/services/webhook.service.js` - Finalize download

### Controllers
- ✅ `src/controllers/infoCourse.controller.js`
- ⚠️ `src/controllers/payment.controller.js` - Cần cập nhật response
- ✅ `src/controllers/download.controller.js`

### Routes
- ✅ `src/routes/infoCourse.routes.js` - `/api/v1/info-course/get-course-info`
- ✅ `src/routes/payment.routes.js` - `/api/v1/payment/create-order`, `/webhook`, `/check-status/:orderCode`
- ✅ `src/routes/download.routes.js` - `/api/v1/download`

### Utils
- ✅ `src/utils/qrGenerator.js` - `generateVietQR(amount, content)`
- ✅ `src/utils/url.util.js` - `transformToSamsungUdemy()`
- ✅ `src/utils/logger.util.js`

### Config
- ✅ `src/config/bank.config.js` - Bank config cho QR code

---

## Đề Xuất Cải Thiện

### 1. Cập Nhật `payment.service.js` - `createOrder()`

**Cần thêm:**
1. Import `generateVietQR` từ `qrGenerator.js`
2. Import `downloadService` để tạo download tasks
3. Sau khi tạo order, tạo download tasks
4. Generate QR code với `order_code` làm nội dung
5. Trả về đầy đủ thông tin: QR code, courses, download tasks

**Flow mới:**
```
createOrder(email, courses)
  ↓
Validate input
  ↓
Calculate totalAmount = courses.length * 50000
  ↓
Generate orderCode
  ↓
Create Order (status: 'pending')
  ↓
Create Download Tasks (status: 'pending')
  ↓
Generate QR Code URL
  ↓
Return: order + qrCode + courses + downloadTasks
```

### 2. Cập Nhật `payment.controller.js` - `createOrder()`

**Cần cập nhật response format** để match với output mong muốn.

### 3. Validation

**Hiện tại:** `validateCreateOrder` chỉ validate email và courses array
**Cần:** Đảm bảo courses có đầy đủ thông tin (url, title, price)

### 4. Error Handling

- Nếu tạo order thành công nhưng tạo download tasks thất bại → rollback order?
- Hoặc giữ order và log error để retry sau?

**Đề xuất:** Giữ order, log error, cho phép tạo tasks sau qua webhook hoặc manual.

---

## Luồng Hoàn Chỉnh (Sau Khi Cải Thiện)

```
1. User nhập email + URLs
   → POST /api/v1/info-course/get-course-info
   → Trả về: danh sách courses hợp lệ với price = 50000

2. User click thanh toán
   → POST /api/v1/payment/create-order
   → Tạo Order (pending)
   → Tạo Download Tasks (pending)
   → Generate QR Code
   → Trả về: order + qrCode + courses + downloadTasks

3. User quét QR và thanh toán
   → Payment gateway gửi webhook
   → POST /api/v1/payment/webhook
   → Update Order status: pending → paid
   → (Có thể trigger download tasks processing ở đây)

4. Worker xử lý download
   → Worker lấy tasks có status = 'pending' và order.payment_status = 'paid'
   → Process download
   → Update status: pending → processing → enrolled → completed
```

---

## Checklist Cải Thiện

- [ ] Cập nhật `payment.service.js` - `createOrder()`:
  - [ ] Import `generateVietQR`
  - [ ] Import `downloadService`
  - [ ] Tạo download tasks sau khi tạo order
  - [ ] Generate QR code
  - [ ] Trả về đầy đủ thông tin

- [ ] Cập nhật `payment.controller.js` - `createOrder()`:
  - [ ] Format response đúng với yêu cầu

- [ ] Test flow hoàn chỉnh:
  - [ ] Test tạo order với courses hợp lệ
  - [ ] Test QR code generation
  - [ ] Test download tasks creation
  - [ ] Test webhook payment
  - [ ] Test worker processing

- [ ] Documentation:
  - [ ] Update API docs
  - [ ] Update Postman collection

---

## Ghi Chú

- Giá mỗi khóa học: **50000 VND** (hardcode trong `infoCourse.service.js` và `payment.service.js`)
- Order code format: **DH + 6 digits** (e.g., DH000001)
- QR code sử dụng VietQR API với bank config từ environment variables
- Download tasks có thể được tạo ngay khi tạo order (status: pending) hoặc sau khi thanh toán thành công
