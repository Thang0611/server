# HMAC-SHA256 Implementation for Postman

## Vấn đề

Postman không có module `crypto` của Node.js. Cần sử dụng `crypto-js` thay thế.

## Giải pháp

Postman có sẵn thư viện `crypto-js`. Sử dụng như sau:

```javascript
const CryptoJS = require('crypto-js');
const payload = String(orderId) + String(email) + String(timestamp);
const signature = CryptoJS.HmacSHA256(payload, secretKey).toString(CryptoJS.enc.Hex);
```

## Nếu crypto-js không hoạt động

Nếu `crypto-js` không available, có thể dùng cách sau:

### Option 1: Sử dụng Postman's built-in crypto (nếu có)

Một số phiên bản Postman có built-in crypto object:

```javascript
// Thử dùng built-in crypto (nếu có)
if (typeof crypto !== 'undefined' && crypto.subtle) {
    // Use Web Crypto API
    // Note: This is async and more complex
}
```

### Option 2: Manual implementation (không khuyến nghị)

Nếu không có crypto-js, có thể implement HMAC-SHA256 manually, nhưng rất phức tạp và không khuyến nghị.

### Option 3: Pre-generate signature (cho testing)

Nếu chỉ để test, có thể pre-generate signature bằng script Node.js:

```javascript
// generate-signature.js
const crypto = require('crypto');

const orderId = "23395";
const email = "Nguyenhuuthanga3@gmail.com";
const timestamp = Math.floor(Date.now() / 1000);
const secretKey = "YOUR_SECRET_KEY";

const payload = orderId + email + timestamp;
const signature = crypto
    .createHmac('sha256', secretKey)
    .update(payload)
    .digest('hex');

console.log("Timestamp:", timestamp);
console.log("Signature:", signature);
```

Sau đó copy signature vào Postman header manually.

## Kiểm tra crypto-js có sẵn không

Thêm vào Pre-request Script để test:

```javascript
try {
    const CryptoJS = require('crypto-js');
    console.log("crypto-js is available");
    console.log("CryptoJS version:", CryptoJS.lib ? "loaded" : "not loaded");
} catch (e) {
    console.error("crypto-js not available:", e.message);
}
```

## Postman Version

Đảm bảo bạn đang dùng Postman phiên bản mới nhất. Các phiên bản cũ có thể không có crypto-js.

## Alternative: Sử dụng Postman's Scripts

Nếu vẫn không work, có thể:
1. Generate signature bằng script Node.js riêng
2. Copy vào environment variable
3. Sử dụng variable trong header
