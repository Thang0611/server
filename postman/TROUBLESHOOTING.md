# Troubleshooting - Download API Signature Error

## Lỗi: "Thiếu chữ ký hoặc timestamp"

### Nguyên nhân có thể:

1. **Pre-request script không chạy**
   - Script bị lỗi syntax
   - Environment variable `secret_key` chưa được set
   - Script không được thêm vào request

2. **Headers không được set đúng**
   - Headers có giá trị `{{download_signature}}` thay vì giá trị thực
   - Headers bị override bởi giá trị cũ

3. **Parse body không đúng**
   - `order_id` là số nhưng regex chỉ match string
   - JSON parse fail nhưng fallback regex cũng fail

## Cách kiểm tra:

### 1. Kiểm tra Console trong Postman

1. Mở Postman
2. Click vào request "Create Download Task"
3. Mở tab **Console** (View → Show Postman Console hoặc Ctrl+Alt+C)
4. Gửi request
5. Xem logs trong Console:
   - Nếu thấy "Signature generated" → Script chạy thành công
   - Nếu thấy "Error in pre-request script" → Có lỗi trong script
   - Nếu không thấy gì → Script không chạy

### 2. Kiểm tra Environment Variables

1. Click vào icon **Environments** (bên trái)
2. Chọn environment của bạn
3. Kiểm tra:
   - `base_url`: `https://api.khoahocgiare.info`
   - `secret_key`: Phải có giá trị (giống với `SECRET_KEY` trong `.env`)

### 3. Kiểm tra Headers

1. Mở request "Create Download Task"
2. Click tab **Headers**
3. Kiểm tra:
   - `x-signature`: Phải là chuỗi hex dài (64 ký tự), KHÔNG phải `{{download_signature}}`
   - `x-timestamp`: Phải là số (Unix timestamp), KHÔNG phải `{{timestamp}}`

### 4. Kiểm tra Request Body

Đảm bảo body đúng format:
```json
{
  "order_id": 23395,
  "email": "Nguyenhuuthanga3@gmail.com",
  "courses": [
    "https://udemy.com/course/ky-thuat-am-phan-trong-moi-tinh-huong/"
  ]
}
```

## Các bước sửa lỗi:

### Bước 1: Đảm bảo Environment được set

1. Mở **Environments**
2. Tạo hoặc chọn environment
3. Thêm variable:
   - Key: `secret_key`
   - Value: Giá trị `SECRET_KEY` từ file `.env` của server
4. **Quan trọng**: Chọn environment từ dropdown (góc trên bên phải)

### Bước 2: Kiểm tra Pre-request Script

1. Mở request "Create Download Task"
2. Click tab **Pre-request Script**
3. Đảm bảo script có nội dung (đã được update trong collection mới nhất)
4. Nếu không có, copy script từ file `pre-request-scripts.js`

### Bước 3: Test script manually

Thêm vào cuối Pre-request Script để debug:
```javascript
// Test output
console.log("=== DEBUG INFO ===");
console.log("orderId:", orderId);
console.log("email:", email);
console.log("secretKey exists:", !!secretKey);
console.log("signature:", signature);
console.log("timestamp:", timestamp);
```

### Bước 4: Clear và thử lại

1. Clear environment variables cũ:
   - Xóa `download_signature` và `timestamp` nếu có
2. Gửi lại request
3. Xem Console để debug

## Test thủ công (không dùng Postman)

Nếu Postman vẫn không work, test bằng cURL:

```bash
# 1. Generate timestamp
TIMESTAMP=$(date +%s)

# 2. Set variables
ORDER_ID="23395"
EMAIL="Nguyenhuuthanga3@gmail.com"
SECRET_KEY="YOUR_SECRET_KEY_HERE"

# 3. Generate signature
PAYLOAD="${ORDER_ID}${EMAIL}${TIMESTAMP}"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET_KEY" | sed 's/^.* //')

# 4. Make request
curl -X POST https://api.khoahocgiare.info/api/v1/download \
  -H "Content-Type: application/json" \
  -H "x-signature: $SIGNATURE" \
  -H "x-timestamp: $TIMESTAMP" \
  -d "{
    \"order_id\": 23395,
    \"email\": \"Nguyenhuuthanga3@gmail.com\",
    \"courses\": [
      \"https://udemy.com/course/ky-thuat-am-phan-trong-moi-tinh-huong/\"
    ]
  }"
```

## Checklist

- [ ] Environment được chọn (dropdown góc trên bên phải)
- [ ] `secret_key` được set trong environment
- [ ] Pre-request Script có trong request
- [ ] Console không có lỗi
- [ ] Headers có giá trị thực (không phải `{{variable}}`)
- [ ] Request body đúng format JSON

## Nếu vẫn lỗi:

1. Export collection và environment
2. Xóa và import lại
3. Kiểm tra lại từng bước
4. Xem server logs để biết server nhận được gì
