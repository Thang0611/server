# Tài Liệu API - Hướng Dẫn Tích Hợp Frontend

> **Phiên bản:** 2.0 (Cập nhật ngày 12/01/2026)  
> **Base URL:** `http://your-domain.com/api/v1`  
> **Giá mỗi khóa học:** 2,000 VND

---

## 📋 Mục Lục

1. [Tổng Quan Luồng Xử Lý](#tổng-quan-luồng-xử-lý)
2. [API Endpoints](#api-endpoints)
3. [Code Mẫu Hoàn Chỉnh](#code-mẫu-hoàn-chỉnh)
4. [Xử Lý Lỗi](#xử-lý-lỗi)

---

## Tổng Quan Luồng Xử Lý

```
┌─────────────────────────────────────────────────────────┐
│              QUY TRÌNH ĐẶT KHÓA HỌC                      │
└─────────────────────────────────────────────────────────┘

[1] User nhập URL khóa học
         ↓
[2] Gọi API "Lấy Thông Tin Khóa Học"
         ↓
[3] Hiển thị tên khóa học + giá
         ↓
[4] User nhập email và xác nhận
         ↓
[5] Gọi API "Tạo Đơn Hàng"
         ↓
[6] Hiển thị QR Code để thanh toán
         ↓
[7] User quét mã và chuyển khoản
         ↓
[8] Frontend polling API "Kiểm Tra Trạng Thái" mỗi 3 giây
         ↓
[9] Khi status = "paid" → Hiển thị thông báo thành công
         ↓
[10] Hệ thống tự động:
     - Download khóa học
     - Upload lên Google Drive
     - Gửi email cho user
```

---

## API Endpoints

### 1️⃣ Lấy Thông Tin Khóa Học

**Mục đích:** Crawl thông tin khóa học từ URL (tên, giá, courseId)

#### Request

```http
POST /api/v1/get-course-info
Content-Type: application/json
```

```json
{
  "urls": [
    "https://samsung.udemy.com/course/python-bootcamp/",
    "https://samsung.udemy.com/course/web-development/"
  ]
}
```

#### Response

```json
{
  "success": true,
  "results": [
    {
      "url": "https://samsung.udemy.com/course/python-bootcamp/",
      "title": "Complete Python Bootcamp",
      "courseId": "1234567",
      "price": 2000,
      "success": true
    },
    {
      "url": "https://samsung.udemy.com/course/web-development/",
      "title": "Web Development Masterclass",
      "courseId": "7654321",
      "price": 2000,
      "success": true
    }
  ],
  "totalAmount": 4000,
  "validCourseCount": 2
}
```

#### Code Mẫu

```javascript
async function getCourseInfo(urls) {
  const response = await fetch('http://your-domain.com/api/v1/get-course-info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls })
  });
  
  const data = await response.json();
  return data;
}

// Sử dụng
const result = await getCourseInfo([
  'https://samsung.udemy.com/course/python-bootcamp/'
]);

console.log('Tổng tiền:', result.totalAmount, 'VND');
console.log('Số khóa học hợp lệ:', result.validCourseCount);
```

---

### 2️⃣ Tạo Đơn Hàng

**Mục đích:** Tạo đơn hàng mới và nhận QR code thanh toán

#### Request

```http
POST /api/v1/payment/create-order
Content-Type: application/json
```

```json
{
  "email": "customer@example.com",
  "courses": [
    {
      "url": "https://samsung.udemy.com/course/python-bootcamp/",
      "title": "Complete Python Bootcamp",
      "courseId": "1234567",
      "price": 2000
    }
  ]
}
```

**Lưu ý:** 
- `courses` lấy từ kết quả API Get Course Info (chỉ lấy những course có `success: true`)
- `email` là email user sẽ nhận link Google Drive

#### Response

```json
{
  "success": true,
  "orderId": 123,
  "orderCode": "DH000123",
  "totalAmount": 2000,
  "paymentStatus": "pending",
  "qrCodeUrl": "https://img.vietqr.io/image/MB-0123456789-compact.png?amount=2000&addInfo=DH000123",
  "courses": [...]
}
```

**Giải thích response:**
- `orderCode`: Mã đơn hàng (format: DH + 6 số) - **Quan trọng!** Lưu lại để check status
- `qrCodeUrl`: Link ảnh QR code để hiển thị cho user
- `paymentStatus`: Luôn là `"pending"` khi tạo mới

#### Code Mẫu

```javascript
async function createOrder(email, courses) {
  const response = await fetch('http://your-domain.com/api/v1/payment/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, courses })
  });
  
  const data = await response.json();
  return data;
}

// Sử dụng
const order = await createOrder('user@example.com', validCourses);

console.log('Mã đơn hàng:', order.orderCode);
console.log('QR Code:', order.qrCodeUrl);

// Hiển thị QR code
document.getElementById('qr-image').src = order.qrCodeUrl;
document.getElementById('order-code').textContent = order.orderCode;

// Bắt đầu polling để check payment
startPolling(order.orderCode);
```

---

### 3️⃣ Kiểm Tra Trạng Thái Đơn Hàng

**Mục đích:** Check xem user đã thanh toán chưa (dùng để polling)

#### Request

```http
GET /api/v1/payment/check-status/{orderCode}
```

**Ví dụ:**
```
GET /api/v1/payment/check-status/DH000123
```

#### Response

```json
{
  "success": true,
  "status": "paid",
  "amount": 2000
}
```

**Các trạng thái:**
- `"pending"`: Chưa thanh toán
- `"paid"`: Đã thanh toán, hệ thống đang xử lý download

#### Code Mẫu - Polling

```javascript
function startPolling(orderCode) {
  const interval = setInterval(async () => {
    try {
      const response = await fetch(
        `http://your-domain.com/api/v1/payment/check-status/${orderCode}`
      );
      const data = await response.json();
      
      console.log('Status:', data.status);
      
      if (data.status === 'paid') {
        // Đã thanh toán!
        clearInterval(interval);
        
        alert('✅ Thanh toán thành công!\n\nKhóa học sẽ được gửi đến email của bạn trong 15-30 phút.');
        
        // Redirect hoặc hiển thị thông báo thành công
        window.location.href = '/order-success?orderCode=' + orderCode;
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, 3000); // Poll mỗi 3 giây
  
  // Dừng sau 5 phút (nếu user không thanh toán)
  setTimeout(() => {
    clearInterval(interval);
    alert('⏱️ Hết thời gian chờ. Vui lòng kiểm tra lại sau.');
  }, 300000); // 5 minutes
  
  return interval;
}
```

---

## Code Mẫu Hoàn Chỉnh

### JavaScript Thuần

```javascript
// ===================================================
// HOÀN CHỈNH: Từ nhập URL đến thanh toán
// ===================================================

const API_BASE = 'http://your-domain.com/api/v1';

// Bước 1: Lấy thông tin khóa học
async function step1_getCourseInfo() {
  const urls = document.getElementById('course-urls').value.split('\n');
  
  const response = await fetch(`${API_BASE}/get-course-info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls })
  });
  
  const data = await response.json();
  
  if (data.success) {
    // Hiển thị thông tin
    displayCourseInfo(data);
    return data;
  } else {
    alert('Lỗi: ' + data.error);
  }
}

// Bước 2: Tạo đơn hàng
async function step2_createOrder(email, courses) {
  const response = await fetch(`${API_BASE}/payment/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, courses })
  });
  
  const data = await response.json();
  
  if (data.success) {
    // Hiển thị QR code
    displayQRCode(data);
    
    // Bắt đầu polling
    step3_pollOrderStatus(data.orderCode);
    
    return data;
  } else {
    alert('Lỗi: ' + data.error);
  }
}

// Bước 3: Polling trạng thái
function step3_pollOrderStatus(orderCode) {
  let pollCount = 0;
  
  const interval = setInterval(async () => {
    pollCount++;
    console.log(`Checking status... (${pollCount})`);
    
    const response = await fetch(`${API_BASE}/payment/check-status/${orderCode}`);
    const data = await response.json();
    
    if (data.status === 'paid') {
      clearInterval(interval);
      onPaymentSuccess(orderCode);
    }
    
    // Dừng sau 100 lần (5 phút)
    if (pollCount >= 100) {
      clearInterval(interval);
      onTimeout();
    }
  }, 3000);
}

// Hiển thị thông tin khóa học
function displayCourseInfo(data) {
  const container = document.getElementById('course-list');
  container.innerHTML = '';
  
  data.results.forEach(course => {
    if (course.success) {
      const div = document.createElement('div');
      div.innerHTML = `
        <h3>${course.title}</h3>
        <p>Giá: ${course.price} VND</p>
      `;
      container.appendChild(div);
    }
  });
  
  document.getElementById('total-amount').textContent = data.totalAmount + ' VND';
}

// Hiển thị QR code
function displayQRCode(order) {
  document.getElementById('qr-image').src = order.qrCodeUrl;
  document.getElementById('order-code').textContent = order.orderCode;
  document.getElementById('order-amount').textContent = order.totalAmount + ' VND';
  document.getElementById('payment-section').style.display = 'block';
}

// Xử lý thanh toán thành công
function onPaymentSuccess(orderCode) {
  alert(`✅ Thanh toán thành công!\n\nMã đơn hàng: ${orderCode}\n\nKhóa học sẽ được gửi đến email của bạn trong 15-30 phút.`);
  window.location.href = '/success.html?orderCode=' + orderCode;
}

// Xử lý timeout
function onTimeout() {
  alert('⏱️ Hết thời gian chờ thanh toán.\n\nNếu bạn đã thanh toán, vui lòng kiểm tra email hoặc liên hệ support.');
}
```

### HTML Mẫu

```html
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Đặt Khóa Học Udemy</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
    .step { margin-bottom: 40px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
    textarea { width: 100%; padding: 10px; margin: 10px 0; }
    button { background: #007bff; color: white; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #0056b3; }
    .qr-section { text-align: center; margin-top: 20px; }
    .qr-section img { max-width: 300px; }
  </style>
</head>
<body>
  <h1>🎓 Đặt Khóa Học Udemy</h1>
  
  <!-- Bước 1: Nhập URL -->
  <div class="step" id="step1">
    <h2>Bước 1: Nhập URL Khóa Học</h2>
    <textarea id="course-urls" rows="5" placeholder="Nhập URL khóa học (mỗi dòng 1 URL)
Ví dụ:
https://samsung.udemy.com/course/python-bootcamp/
https://samsung.udemy.com/course/web-development/"></textarea>
    <button onclick="handleStep1()">Lấy Thông Tin Khóa Học</button>
  </div>
  
  <!-- Bước 2: Xác nhận đơn hàng -->
  <div class="step" id="step2" style="display: none;">
    <h2>Bước 2: Xác Nhận Đơn Hàng</h2>
    <div id="course-list"></div>
    <p><strong>Tổng tiền: <span id="total-amount"></span></strong></p>
    <input type="email" id="email" placeholder="Email của bạn" style="width: 100%; padding: 10px; margin: 10px 0;">
    <button onclick="handleStep2()">Tạo Đơn Hàng</button>
  </div>
  
  <!-- Bước 3: Thanh toán -->
  <div class="step qr-section" id="step3" style="display: none;">
    <h2>Bước 3: Quét Mã QR Để Thanh toán</h2>
    <p>Mã đơn hàng: <strong id="order-code"></strong></p>
    <p>Số tiền: <strong id="order-amount"></strong></p>
    <img id="qr-image" alt="QR Code">
    <p id="status">⏳ Đang chờ thanh toán...</p>
  </div>

  <script>
    const API_BASE = 'http://your-domain.com/api/v1';
    let courseData = null;
    
    // Handler Bước 1
    async function handleStep1() {
      const urls = document.getElementById('course-urls').value
        .split('\n')
        .map(url => url.trim())
        .filter(url => url);
      
      if (urls.length === 0) {
        alert('Vui lòng nhập ít nhất 1 URL');
        return;
      }
      
      try {
        const response = await fetch(`${API_BASE}/get-course-info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls })
        });
        
        courseData = await response.json();
        
        if (courseData.success) {
          displayCourseInfo(courseData);
          document.getElementById('step1').style.display = 'none';
          document.getElementById('step2').style.display = 'block';
        } else {
          alert('Lỗi: ' + courseData.error);
        }
      } catch (error) {
        alert('Lỗi kết nối: ' + error.message);
      }
    }
    
    // Handler Bước 2
    async function handleStep2() {
      const email = document.getElementById('email').value;
      
      if (!email) {
        alert('Vui lòng nhập email');
        return;
      }
      
      const validCourses = courseData.results.filter(c => c.success);
      
      try {
        const response = await fetch(`${API_BASE}/payment/create-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, courses: validCourses })
        });
        
        const order = await response.json();
        
        if (order.success) {
          displayPayment(order);
          document.getElementById('step2').style.display = 'none';
          document.getElementById('step3').style.display = 'block';
          startPolling(order.orderCode);
        } else {
          alert('Lỗi: ' + order.error);
        }
      } catch (error) {
        alert('Lỗi kết nối: ' + error.message);
      }
    }
    
    // Hiển thị khóa học
    function displayCourseInfo(data) {
      const container = document.getElementById('course-list');
      container.innerHTML = data.results.map(course => {
        if (course.success) {
          return `<div style="padding: 10px; border-bottom: 1px solid #eee;">
            <strong>✅ ${course.title}</strong><br>
            <small>${course.url}</small><br>
            Giá: ${course.price} VND
          </div>`;
        } else {
          return `<div style="padding: 10px; border-bottom: 1px solid #eee; color: #999;">
            <strong>❌ URL không hợp lệ</strong><br>
            <small>${course.url}</small>
          </div>`;
        }
      }).join('');
      
      document.getElementById('total-amount').textContent = data.totalAmount + ' VND';
    }
    
    // Hiển thị thanh toán
    function displayPayment(order) {
      document.getElementById('order-code').textContent = order.orderCode;
      document.getElementById('order-amount').textContent = order.totalAmount + ' VND';
      document.getElementById('qr-image').src = order.qrCodeUrl;
    }
    
    // Polling
    function startPolling(orderCode) {
      let count = 0;
      const interval = setInterval(async () => {
        count++;
        
        try {
          const response = await fetch(`${API_BASE}/payment/check-status/${orderCode}`);
          const data = await response.json();
          
          document.getElementById('status').textContent = 
            data.status === 'paid' 
              ? '✅ Đã thanh toán thành công!' 
              : `⏳ Đang chờ thanh toán... (${count})`;
          
          if (data.status === 'paid') {
            clearInterval(interval);
            setTimeout(() => {
              alert(`✅ Thanh toán thành công!\n\nMã đơn hàng: ${orderCode}\n\nKhóa học sẽ được gửi đến email của bạn trong 15-30 phút.`);
            }, 500);
          }
          
          if (count >= 100) {
            clearInterval(interval);
            document.getElementById('status').textContent = '⏱️ Hết thời gian chờ';
          }
        } catch (error) {
          console.error('Polling error:', error);
        }
      }, 3000);
    }
  </script>
</body>
</html>
```

---

## Xử Lý Lỗi

### Các Lỗi Thường Gặp

| Lỗi | Nguyên nhân | Cách xử lý |
|-----|-------------|------------|
| `Email và danh sách khóa học là bắt buộc` | Thiếu field trong request | Check request body |
| `Không có khóa học hợp lệ` | Tất cả courses đều có `success: false` | Kiểm tra URL khóa học |
| `Order not found` | Mã đơn hàng sai | Kiểm tra lại orderCode |
| `Invalid order code format` | Format orderCode sai | Phải là DH + 6 số (VD: DH000123) |

### Code Xử Lý Lỗi

```javascript
async function apiCall(url, options) {
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (!response.ok || !data.success) {
      throw new Error(data.error || data.message || 'Unknown error');
    }
    
    return data;
  } catch (error) {
    // Hiển thị lỗi thân thiện với user
    let userMessage = 'Đã có lỗi xảy ra. Vui lòng thử lại.';
    
    if (error.message.includes('Failed to fetch')) {
      userMessage = 'Lỗi kết nối. Vui lòng kiểm tra internet.';
    } else if (error.message.includes('404')) {
      userMessage = 'Không tìm thấy. Vui lòng kiểm tra lại.';
    } else if (error.message.includes('500')) {
      userMessage = 'Lỗi server. Vui lòng thử lại sau.';
    } else {
      userMessage = error.message;
    }
    
    alert('❌ ' + userMessage);
    throw error;
  }
}
```

---

## Lưu Ý Quan Trọng

### ✅ Nên làm

1. **Validate input trước khi gọi API**
   ```javascript
   // Check email format
   if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
     alert('Email không hợp lệ');
     return;
   }
   ```

2. **Hiển thị loading state**
   ```javascript
   button.disabled = true;
   button.textContent = 'Đang xử lý...';
   ```

3. **Dừng polling khi unmount component**
   ```javascript
   // React
   useEffect(() => {
     const interval = startPolling(orderCode);
     return () => clearInterval(interval);
   }, []);
   ```

4. **Cache course info để tránh gọi lại**
   ```javascript
   const cache = new Map();
   if (cache.has(url)) return cache.get(url);
   ```

### ❌ Không nên làm

1. **Không poll quá nhanh** (< 2 giây)
2. **Không gửi raw user input** mà không validate
3. **Không hard-code API URL** trong nhiều file
4. **Không quên cleanup interval** khi component unmount

---

## Test API với cURL

```bash
# Test 1: Get Course Info
curl -X POST http://your-domain.com/api/v1/get-course-info \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://samsung.udemy.com/course/python-bootcamp/"]}'

# Test 2: Create Order
curl -X POST http://your-domain.com/api/v1/payment/create-order \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "courses": [{
      "url": "https://samsung.udemy.com/course/python-bootcamp/",
      "title": "Python Bootcamp",
      "price": 2000
    }]
  }'

# Test 3: Check Status
curl http://your-domain.com/api/v1/payment/check-status/DH000123
```

---

## Câu Hỏi Thường Gặp

### Q: Tại sao phải polling? Không dùng WebSocket được sao?

**A:** Polling đơn giản hơn và phù hợp với use case này. Thanh toán thường xảy ra trong vòng 30 giây, polling mỗi 3 giây là đủ.

### Q: User đóng trình duyệt giữa chừng thì sao?

**A:** Không sao! Khi user thanh toán, hệ thống vẫn sẽ xử lý và gửi email. User chỉ cần check email là được.

### Q: Làm sao biết khóa học đã tải xong?

**A:** User sẽ nhận email với link Google Drive khi hoàn tất. Thời gian: 15-30 phút tùy dung lượng khóa học.

### Q: Nếu thanh toán nhưng không nhận được email?

**A:** Check spam folder trước. Nếu vẫn không có, liên hệ support với mã đơn hàng.

---

## Liên Hệ Support

- **Lỗi kỹ thuật:** Check logs tại `/root/server/logs/`
- **Lỗi thanh toán:** Check SePay webhook logs
- **Lỗi download:** Check worker logs: `tail -f /root/server/logs/rq_worker_*.log`

---

**Cập nhật lần cuối:** 12/01/2026  
**Phiên bản API:** 2.0  
**Trạng thái:** ✅ Production Ready

---

## Quick Reference Card

```javascript
// 1. Lấy thông tin khóa học
POST /api/v1/get-course-info
Body: { urls: [...] }
Response: { success, results, totalAmount, validCourseCount }

// 2. Tạo đơn hàng
POST /api/v1/payment/create-order
Body: { email, courses: [...] }
Response: { success, orderCode, qrCodeUrl, totalAmount, ... }

// 3. Kiểm tra trạng thái
GET /api/v1/payment/check-status/{orderCode}
Response: { success, status, amount }
// status: "pending" | "paid"
```
