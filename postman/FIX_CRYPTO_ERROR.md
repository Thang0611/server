# Fix: "Cannot find module 'crypto'" trong Postman

## Vấn đề

Postman không có module `crypto` của Node.js. Script đang dùng:
```javascript
const crypto = require('crypto'); // ❌ Không work trong Postman
```

## Giải pháp

Đã sửa để dùng `crypto-js` (có sẵn trong Postman):
```javascript
const CryptoJS = require('crypto-js'); // ✅ Work trong Postman
const signature = CryptoJS.HmacSHA256(payload, secretKey).toString(CryptoJS.enc.Hex);
```

## Đã sửa

✅ `KhoaHocGiaRe_API.postman_collection.json` - Collection đã được update
✅ `pre-request-scripts.js` - Script đã được update

## Cách sử dụng

### Bước 1: Import lại Collection

1. Xóa collection cũ (nếu có)
2. Import lại file `KhoaHocGiaRe_API.postman_collection.json`
3. Collection mới đã có script đúng

### Bước 2: Kiểm tra Pre-request Script

1. Mở request "Create Download Task"
2. Click tab **Pre-request Script**
3. Đảm bảo script có dòng:
   ```javascript
   const CryptoJS = require('crypto-js');
   ```
   (KHÔNG phải `require('crypto')`)

### Bước 3: Test

1. Set environment variable `secret_key`
2. Gửi request
3. Xem Console để verify:
   - "Signature generated: ..." → ✅ Success
   - "Error: Cannot find module..." → ❌ Vẫn còn lỗi

## Nếu vẫn lỗi "Cannot find module 'crypto-js'"

### Option 1: Update Postman

Đảm bảo bạn dùng Postman phiên bản mới nhất:
- Postman Desktop App: Update từ Help → Check for Updates
- Postman Web: Refresh browser

### Option 2: Manual Script

Copy script này vào Pre-request Script tab:

```javascript
try {
    // Generate timestamp
    const timestamp = Math.floor(Date.now() / 1000);
    pm.environment.set("timestamp", timestamp.toString());
    
    // Parse request body
    const body = JSON.parse(pm.request.body.raw);
    const orderId = String(body.order_id || "");
    const email = body.email || "";
    
    // Get secret key
    const secretKey = pm.environment.get("secret_key");
    
    if (!secretKey) {
        throw new Error("secret_key not set in environment");
    }
    
    // Generate signature using crypto-js
    const CryptoJS = require('crypto-js');
    const payload = orderId + email + timestamp;
    const signature = CryptoJS.HmacSHA256(payload, secretKey).toString(CryptoJS.enc.Hex);
    
    // Set headers
    pm.request.headers.remove("x-signature");
    pm.request.headers.remove("x-timestamp");
    pm.request.headers.upsert({ key: "x-signature", value: signature });
    pm.request.headers.upsert({ key: "x-timestamp", value: timestamp.toString() });
    
    console.log("✅ Signature generated:", signature);
} catch (error) {
    console.error("❌ Error:", error.message);
}
```

### Option 3: Generate Signature Bên Ngoài

Nếu Postman vẫn không work, generate signature bằng Node.js:

```bash
# Tạo file generate-sig.js
node -e "
const crypto = require('crypto');
const orderId = '23395';
const email = 'Nguyenhuuthanga3@gmail.com';
const timestamp = Math.floor(Date.now() / 1000);
const secretKey = 'YOUR_SECRET_KEY';
const payload = orderId + email + timestamp;
const signature = crypto.createHmac('sha256', secretKey).update(payload).digest('hex');
console.log('Timestamp:', timestamp);
console.log('Signature:', signature);
"
```

Sau đó copy signature và timestamp vào Postman headers manually.

## Verify

Sau khi fix, trong Postman Console bạn sẽ thấy:
```
Parsed orderId: 23395
Parsed email: Nguyenhuuthanga3@gmail.com
Payload for signature: 23395Nguyenhuuthanga3@gmail.com1704972000
Generated signature: abc123... (64 ký tự hex)
Timestamp: 1704972000
Headers set successfully
```

Nếu thấy "Error: Cannot find module 'crypto-js'", có thể Postman version cũ. Update Postman hoặc dùng Option 3.
