# Quick Start Guide - Download API

## Issue: "Thiếu chữ ký hoặc timestamp"

This error occurs when the required authentication headers are missing.

## Solution

The `/api/v1/download` endpoint requires two headers:
1. `x-signature` - HMAC SHA256 signature
2. `x-timestamp` - Unix timestamp

## Using Postman (Recommended)

1. **Import the collection** (if not already done)
2. **Set environment variables**:
   - `base_url`: `https://api.khoahocgiare.info`
   - `secret_key`: Your `SECRET_KEY` from `.env` file
3. **Use the "Create Download Task" request** - it automatically generates the signature!

The pre-request script will:
- Generate a timestamp
- Extract `order_id` and `email` from your request body
- Generate the signature using your `secret_key`
- Add the headers automatically

## Manual Request Format

### Correct Request Body Format

```json
{
  "order_id": 23395,
  "email": "Nguyenhuuthanga3@gmail.com",
  "courses": [
    {
      "url": "https://udemy.com/course/ky-thuat-am-phan-trong-moi-tinh-huong/"
    }
  ],
  "phone_number": null
}
```

**Important:** `courses` must be an array of **objects** with `url` property, not an array of strings.

### Required Headers

```
Content-Type: application/json
x-signature: <generated_signature>
x-timestamp: <unix_timestamp>
```

### Signature Generation

The signature is generated using:
```
HMAC_SHA256(order_id + email + timestamp, SECRET_KEY)
```

**Example using Node.js:**
```javascript
const crypto = require('crypto');

const orderId = "23395";
const email = "Nguyenhuuthanga3@gmail.com";
const timestamp = Math.floor(Date.now() / 1000).toString();
const secretKey = "YOUR_SECRET_KEY";

const payload = orderId + email + timestamp;
const signature = crypto
  .createHmac('sha256', secretKey)
  .update(payload)
  .digest('hex');

console.log('Signature:', signature);
console.log('Timestamp:', timestamp);
```

**Example using cURL:**
```bash
# Generate timestamp
TIMESTAMP=$(date +%s)

# Generate signature (requires openssl)
ORDER_ID="23395"
EMAIL="Nguyenhuuthanga3@gmail.com"
SECRET_KEY="YOUR_SECRET_KEY"
PAYLOAD="${ORDER_ID}${EMAIL}${TIMESTAMP}"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET_KEY" | sed 's/^.* //')

# Make request
curl -X POST https://api.khoahocgiare.info/api/v1/download \
  -H "Content-Type: application/json" \
  -H "x-signature: $SIGNATURE" \
  -H "x-timestamp: $TIMESTAMP" \
  -d '{
    "order_id": 23395,
    "email": "Nguyenhuuthanga3@gmail.com",
    "courses": [
      {
        "url": "https://udemy.com/course/ky-thuat-am-phan-trong-moi-tinh-huong/"
      }
    ]
  }'
```

## Common Mistakes

### ❌ Wrong: Array of strings
```json
{
  "courses": [
    "https://udemy.com/course/example/"
  ]
}
```

### ✅ Correct: Array of objects
```json
{
  "courses": [
    {
      "url": "https://udemy.com/course/example/"
    }
  ]
}
```

### ❌ Wrong: Missing headers
```
POST /api/v1/download
Content-Type: application/json
```

### ✅ Correct: With authentication headers
```
POST /api/v1/download
Content-Type: application/json
x-signature: abc123...
x-timestamp: 1704972000
```

## Testing in Postman

1. Open the "Create Download Task" request
2. Update the body with your data:
   ```json
   {
     "order_id": 23395,
     "email": "Nguyenhuuthanga3@gmail.com",
     "courses": [
       {
         "url": "https://udemy.com/course/ky-thuat-am-phan-trong-moi-tinh-huong/"
       }
     ]
   }
   ```
3. Make sure `secret_key` is set in your environment
4. Click "Send"
5. The signature will be generated automatically!

## Expected Response

**Success (200):**
```json
{
  "status": "queued",
  "message": "Đã nhận 1 khóa học",
  "order_id": 23395,
  "urls": [
    "https://samsungu.udemy.com/course/ky-thuat-am-phan-trong-moi-tinh-huong/"
  ]
}
```

**Error (400):**
```json
{
  "success": false,
  "message": "Thiếu chữ ký hoặc timestamp"
}
```

## Troubleshooting

1. **"Thiếu chữ ký hoặc timestamp"**
   - Make sure headers `x-signature` and `x-timestamp` are included
   - In Postman: Check that pre-request script ran (check Console)

2. **"Sai chữ ký bảo mật"**
   - Verify `SECRET_KEY` matches server configuration
   - Check that signature is generated correctly
   - Ensure timestamp is current (within 5 minutes)

3. **"Đơn hàng không tồn tại trong hệ thống"**
   - The order_id doesn't exist in the database
   - This is OK - the task will be created with `order_id = null`
   - Or create the order first using `/api/payment/create-order`
