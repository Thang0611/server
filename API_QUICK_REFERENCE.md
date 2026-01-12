# API Quick Reference Card

> **Base URL:** `http://your-domain.com/api/v1`  
> **Giá:** 2,000 VND/khóa học

---

## 📌 3 APIs Chính

### 1️⃣ GET COURSE INFO
```bash
POST /get-course-info
```
```json
Request:  { "urls": ["..."] }
Response: { "success": true, "results": [...], "totalAmount": 4000 }
```

### 2️⃣ CREATE ORDER
```bash
POST /payment/create-order
```
```json
Request:  { "email": "user@example.com", "courses": [...] }
Response: { "success": true, "orderCode": "DH000123", "qrCodeUrl": "..." }
```

### 3️⃣ CHECK STATUS (Polling)
```bash
GET /payment/check-status/{orderCode}
```
```json
Response: { "success": true, "status": "paid", "amount": 2000 }
```

---

## 🔄 Complete Flow (Copy-Paste Ready)

```javascript
const API = 'http://your-domain.com/api/v1';

// Step 1: Get course info
const info = await fetch(`${API}/get-course-info`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ urls: ['https://samsung.udemy.com/course/...'] })
}).then(r => r.json());

// Step 2: Create order
const order = await fetch(`${API}/payment/create-order`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    courses: info.results.filter(c => c.success)
  })
}).then(r => r.json());

// Display QR code
document.querySelector('img').src = order.qrCodeUrl;

// Step 3: Poll status every 3s
const poll = setInterval(async () => {
  const status = await fetch(`${API}/payment/check-status/${order.orderCode}`)
    .then(r => r.json());
  
  if (status.status === 'paid') {
    clearInterval(poll);
    alert('✅ Thanh toán thành công!');
  }
}, 3000);
```

---

## 📋 Response Fields

### Get Course Info
- `results[]`: Danh sách khóa học
  - `url`, `title`, `courseId`, `price`, `success`
- `totalAmount`: Tổng tiền
- `validCourseCount`: Số khóa học hợp lệ

### Create Order
- `orderCode`: Mã đơn hàng (DH + 6 số)
- `qrCodeUrl`: Link QR code
- `totalAmount`: Tổng tiền
- `paymentStatus`: "pending"

### Check Status
- `status`: "pending" | "paid"
- `amount`: Số tiền

---

## ⚠️ Important Notes

1. **Polling:** 3 giây/lần, tối đa 5 phút
2. **Order Code:** Format DH000123 (DH + 6 số)
3. **Email:** User nhận link Drive sau 15-30 phút
4. **Price:** 2,000 VND/khóa học (fixed)

---

## 🐛 Error Handling

```javascript
try {
  const res = await fetch(url, options);
  const data = await res.json();
  
  if (!data.success) throw new Error(data.error);
  return data;
} catch (err) {
  alert('Lỗi: ' + err.message);
}
```

---

## 🧪 Test với cURL

```bash
# 1. Get info
curl -X POST http://localhost:3000/api/v1/get-course-info \
  -H "Content-Type: application/json" \
  -d '{"urls":["https://samsung.udemy.com/course/python-bootcamp/"]}'

# 2. Create order
curl -X POST http://localhost:3000/api/v1/payment/create-order \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","courses":[{"url":"...","price":2000}]}'

# 3. Check status
curl http://localhost:3000/api/v1/payment/check-status/DH000123
```

---

**Full Docs:** 
- English: `API_DOCS.md` (React/Vue examples)
- Tiếng Việt: `API_DOCS_VI.md` (HTML/JS examples)
