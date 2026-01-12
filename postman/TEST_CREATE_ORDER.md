# Hướng Dẫn Test API Create Order

## Endpoint
```
POST /api/payment/create-order
```

## Request Body Format

```json
{
  "email": "customer@example.com",
  "courses": [
    {
      "url": "https://www.udemy.com/course/ky-thuat-am-phan-trong-moi-tinh-huong/",
      "title": "Kỹ Thuật Âm Phản Trong Mọi Tình Huống",
      "price": 50000
    }
  ]
}
```

### Request Fields

- **email** (required, string): Email của khách hàng (phải đúng format email)
- **courses** (required, array): Danh sách khóa học
  - **url** (required, string): URL của khóa học Udemy
  - **title** (optional, string): Tên khóa học
  - **price** (optional, number): Giá khóa học (mặc định: 50000 VND)

## Response Format

### Success Response (200)

```json
{
  "success": true,
  "orderId": 1,
  "orderCode": "DH123456",
  "totalAmount": 50000,
  "paymentStatus": "pending",
  "paymentUrl": null
}
```

### Error Responses

#### 400 - Email không hợp lệ
```json
{
  "success": false,
  "message": "Email không hợp lệ"
}
```

#### 400 - Danh sách khóa học không hợp lệ
```json
{
  "success": false,
  "message": "Danh sách khóa học không hợp lệ"
}
```

#### 400 - URL khóa học không hợp lệ
```json
{
  "success": false,
  "message": "URL khóa học không hợp lệ"
}
```

## Cách Test với Postman

### 1. Import Collection
- Import file `KhoaHocGiaRe_API.postman_collection.json`
- Import file `KhoaHocGiaRe_API.postman_environment.json`

### 2. Set Environment Variables
- `base_url`: `https://api.khoahocgiare.info` (hoặc `http://localhost:3000` cho local)

### 3. Chạy Request
1. Mở collection **"Payment"** → **"Create Order"**
2. Kiểm tra request body đã đúng format chưa
3. Click **Send**

### 4. Kiểm tra Response
- Status code phải là `200`
- Response có `success: true`
- Response có `orderCode` (format: `DH` + 6 số, ví dụ: `DH123456`)
- Response có `orderId`, `totalAmount`, `paymentStatus`

### 5. Lưu Order Code
- Postman sẽ tự động lưu `orderCode` vào environment variable `last_order_code`
- Có thể dùng `{{last_order_code}}` trong các request khác

## Cách Test với cURL

```bash
curl -X POST https://api.khoahocgiare.info/api/payment/create-order \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "courses": [
      {
        "url": "https://www.udemy.com/course/ky-thuat-am-phan-trong-moi-tinh-huong/",
        "title": "Kỹ Thuật Âm Phản Trong Mọi Tình Huống",
        "price": 50000
      }
    ]
  }'
```

## Cách Test với JavaScript (Node.js)

```javascript
const axios = require('axios');

async function testCreateOrder() {
  try {
    const response = await axios.post('https://api.khoahocgiare.info/api/payment/create-order', {
      email: 'customer@example.com',
      courses: [
        {
          url: 'https://www.udemy.com/course/ky-thuat-am-phan-trong-moi-tinh-huong/',
          title: 'Kỹ Thuật Âm Phản Trong Mọi Tình Huống',
          price: 50000
        }
      ]
    });

    console.log('Success:', response.data);
    console.log('Order Code:', response.data.orderCode);
    console.log('Order ID:', response.data.orderId);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testCreateOrder();
```

## Validation Rules

1. **Email**: Phải đúng format email (có @ và domain)
2. **Courses**: Phải là array, không được rỗng
3. **Course URL**: Mỗi course phải có `url` là string
4. **Course Price**: Nếu có, phải là number >= 0

## Tính Toán Total Amount

- Mỗi khóa học có giá mặc định: **50,000 VND**
- `totalAmount = số lượng khóa học × 50,000`
- Ví dụ: 2 khóa học = 100,000 VND

## Order Code Format

- Format: `DH` + 6 chữ số
- Ví dụ: `DH123456`, `DH000001`
- Tự động generate, đảm bảo unique

## Lưu Ý

1. Order được tạo với `payment_status: "pending"`
2. Sau khi tạo order, cần gọi webhook hoặc update payment status để chuyển sang `"paid"`
3. Order code được lưu tự động vào environment variable `last_order_code` trong Postman
4. Có thể dùng order code để check status: `GET /api/payment/check-status/{orderCode}`
