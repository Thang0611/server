# Postman Collection for GetCourses API

This directory contains Postman collections and environment files for testing the GetCourses API.

## Files

- `GetCourses_API.postman_collection.json` - Main API collection with all endpoints
- `GetCourses_API.postman_environment.json` - Environment variables for testing

## Setup Instructions

### 1. Import Collection

1. Open Postman
2. Click **Import** button
3. Select `GetCourses_API.postman_collection.json`
4. Click **Import**

### 2. Import Environment

1. Click **Environments** in the left sidebar
2. Click **Import**
3. Select `GetCourses_API.postman_environment.json`
4. Click **Import**
5. Select the environment from the dropdown (top right)

### 3. Configure Environment Variables

Update the following variables in the environment:

- `base_url`: `https://api.getcourses.net` (already set)
- `secret_key`: Your `SECRET_KEY` from `.env` file
- `api_secret_key`: Your `API_SECRET_KEY` from `.env` file
- `test_email`: Test email address for testing
- `test_order_id`: Test order ID

## API Endpoints

### Health Check
- **GET** `/` - Check server status

### Download
- **POST** `/api/v1/download` - Create download tasks
  - Requires: `x-signature` and `x-timestamp` headers
  - Body: `order_id`, `email`, `courses[]`, `phone_number` (optional)

### Enroll
- **POST** `/api/v1/enroll` - Enroll in courses
  - Body: `email`, `urls[]`

### Course Info
- **POST** `/api/v1/get-course-info` - Get course information
  - Body: `urls[]`
  - Returns: Course title, image, courseId, price

### Grant Access
- **POST** `/api/v1/grant-access` - Grant Google Drive access
  - Body: `order_id`, `email`, `courses[]` with `course_name` and `drive_link`
  - Returns immediately, processes in background

### Payment
- **POST** `/api/payment/create-order` - Create payment order
  - Body: `email`, `courses[]` with `url`, `title`, `price`
  - Returns: Order code, QR code URL, bank info

- **POST** `/api/payment/webhook` - Payment webhook
  - Body: `transferContent`, `transferAmount`, `gatewayData`
  - Called by payment gateway

- **GET** `/api/payment/check-status/:orderCode` - Check order status
  - Path parameter: `orderCode` (e.g., `DH000123`)

### Webhook
- **POST** `/api/v1/webhook/finalize` - Finalize download task
  - Body: `secret_key`, `task_id`, `folder_name`
  - Called by Python download script

## Signature Generation

For the download endpoint, you need to generate a signature:

```
signature = HMAC_SHA256(order_id + email + timestamp, SECRET_KEY)
```

### Pre-request Script Example

You can add this to the download request's Pre-request Script tab:

```javascript
// Generate timestamp
const timestamp = Math.floor(Date.now() / 1000);
pm.environment.set("timestamp", timestamp.toString());

// Get values
const orderId = pm.request.body.urlencoded.get("order_id") || pm.request.body.raw.match(/"order_id"\s*:\s*"([^"]+)"/)?.[1] || "";
const email = pm.request.body.urlencoded.get("email") || pm.request.body.raw.match(/"email"\s*:\s*"([^"]+)"/)?.[1] || "";
const secretKey = pm.environment.get("secret_key");

// Generate signature
const crypto = require('crypto');
const payload = orderId + email + timestamp;
const signature = crypto.createHmac('sha256', secretKey).update(payload).digest('hex');

pm.environment.set("download_signature", signature);
```

## Testing Workflow

### 1. Test Health Check
- Run the Health Check request to verify server is running

### 2. Get Course Info
- Use Get Course Information to fetch course details
- Copy course URLs for other tests

### 3. Create Order
- Use Create Order to create a payment order
- Save the `orderCode` from response

### 4. Check Order Status
- Use Check Order Status with the order code from step 3
- Should return `pending` status

### 5. Simulate Payment Webhook
- Use Payment Webhook with order code in `transferContent`
- Format: `"DH000123 Payment for courses"`
- Order status should change to `paid`

### 6. Create Download Task
- Use Create Download Task with order_id and courses
- Requires signature generation (see above)

### 7. Enroll in Courses
- Use Enroll in Courses with email and course URLs
- Requires existing download tasks in database

### 8. Grant Access
- Use Grant Google Drive Access with order_id, email, and drive links
- Processes in background

### 9. Finalize Download
- Use Finalize Download after files are uploaded
- Requires `api_secret_key` and `task_id`

## Notes

- All timestamps should be Unix timestamps (seconds since epoch)
- Signature generation must match server-side logic exactly
- Some endpoints require existing data in database (e.g., enroll requires download tasks)
- Grant Access returns immediately and processes asynchronously
- Payment webhook should always return success to prevent retries

## Troubleshooting

### Signature Validation Failed
- Check that `SECRET_KEY` matches server configuration
- Verify timestamp is current (within 5 minutes)
- Ensure signature is generated correctly: `order_id + email + timestamp`

### 404 Not Found
- Verify `base_url` is correct
- Check that server is running
- Ensure route paths match exactly

### 400 Bad Request
- Check request body format (JSON)
- Verify all required fields are present
- Check validation rules in `validation.middleware.js`

### 403 Forbidden
- Verify secret keys are correct
- Check signature generation
- Ensure API_SECRET_KEY matches for webhook endpoints
