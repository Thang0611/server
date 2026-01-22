# 🔍 KIỂM TRA QUÁ TRÌNH DOWNLOAD, HOOK VÀ EMAIL

**Ngày kiểm tra**: 2026-01-18  
**Order Code**: DH000044

---

## 📊 KẾT QUẢ KIỂM TRA

### ✅ **1. Order Status**
- **Payment Status**: `paid` ✅
- **Order Status**: `processing` ⏳
- **Task ID**: 66
- **Task Status**: `processing` ⏳

### ✅ **2. Worker Status**
- **Workers Running**: 2 instances (online) ✅
- **Queue Length**: 0 (empty)
- **Worker Logs**: Workers đang listen queue nhưng không có job

### ⚠️ **3. Enrollment Error**
**Lỗi phát hiện**: `task is not defined` khi enroll task 66

**Nguyên nhân**: 
- Lỗi xảy ra trong `enroll.service.js` catch block
- Biến `task` có thể undefined nếu lỗi xảy ra trước khi tìm thấy task
- Test course URL có thể không hợp lệ: `https://samsungu.udemy.com/course/test-course/`

**Log**:
```
Exception during course enrollment: task is not defined 
[taskId=66, email=test@example.com, courseUrl=https://samsungu.udemy.com/course/test-course/]
```

### ✅ **4. Finalize Webhook Test**
**Kết quả test**:
```json
{
  "success": true,
  "taskId": 66,
  "driveLink": null,
  "status": "failed"
}
```

**Giải thích**:
- Webhook được gọi thành công ✅
- Drive folder không tìm thấy (expected vì đây là test) ⚠️
- Task status: `failed` (do không có drive link)

### ✅ **5. Email Configuration**
- **Email User**: `downloadudemyfull@gmail.com` ✅
- **Email Password**: Set ✅
- **Email Service**: Hoạt động tốt ✅

**Email Logs** (từ order khác):
```
[Batch Email] Order completion email sent successfully 
[orderId=36, orderCode=DH000036, email=nguyenhuuthanga3@gmail.com]
```

---

## 🔄 FLOW STATUS

```
✅ Create Order          → DH000044 created
✅ Payment Webhook       → Payment confirmed
⚠️  Enrollment            → ERROR: task is not defined
❌ Queue Push            → Not executed (enrollment failed)
❌ Worker Download       → Not started
❌ Finalize Webhook      → Not called by worker
❌ Completion Email      → Not sent
```

---

## 🐛 VẤN ĐỀ PHÁT HIỆN

### **1. Enrollment Error: "task is not defined"**

**File**: `server/src/services/enroll.service.js:344`

**Vấn đề**: 
- Trong catch block, code reference `task?.id` nhưng `task` có thể undefined
- Xảy ra khi lỗi xảy ra trước khi tìm thấy task trong DB

**Fix cần thiết**:
```javascript
// Line 344 - Current
Logger.error('Enrollment failed', err, { url: rawUrl, email, taskId: task?.id });

// Should be safe, but need to check if task is defined earlier in catch
```

### **2. Test Course URL Invalid**

**URL**: `https://samsungu.udemy.com/course/test-course/`

**Vấn đề**:
- URL này không tồn tại thực tế trên Udemy
- Enrollment sẽ fail vì không tìm thấy course
- Worker sẽ không thể download

**Giải pháp**: 
- Test với course URL thật từ Udemy
- Hoặc mock enrollment cho test

---

## ✅ CÁC THÀNH PHẦN HOẠT ĐỘNG TỐT

1. ✅ **Order Creation** - Hoạt động tốt
2. ✅ **Payment Webhook** - Xử lý đúng
3. ✅ **Finalize Webhook Endpoint** - Nhận và xử lý request đúng
4. ✅ **Email Service** - Config đúng, đã gửi email thành công cho order khác
5. ✅ **Worker Processes** - Đang chạy và listen queue
6. ✅ **Redis Queue** - Hoạt động (queue rỗng là bình thường nếu không có job)

---

## 🔧 KHUYẾN NGHỊ

### **1. Fix Enrollment Error**
- Kiểm tra và fix lỗi "task is not defined" trong catch block
- Đảm bảo task được tìm thấy trước khi enroll

### **2. Test với Course URL Thật**
- Sử dụng course URL hợp lệ từ Udemy để test
- Hoặc tạo mock enrollment cho test environment

### **3. Monitor Worker Logs**
- Check worker logs để xem có job nào đang được process không
- Verify worker có thể connect đến Udemy và download

### **4. Test Complete Flow**
- Tạo order với course URL thật
- Simulate payment
- Monitor đến khi complete
- Verify email được gửi

---

## 📝 TEST COMMANDS

### Check Order Status
```bash
curl http://localhost:3000/api/v1/payment/check-status/DH000044
```

### Check Order Details
```bash
curl "http://localhost:3000/api/v1/payment/lookup?email=test@example.com"
```

### Check Worker Logs
```bash
pm2 logs workers --lines 20
```

### Test Finalize Webhook
```bash
# Need: task_id, folder_name, API_SECRET_KEY
curl -X POST http://localhost:3000/api/v1/webhook/finalize \
  -H "Content-Type: application/json" \
  -H "X-Signature: <hmac-signature>" \
  -H "X-Timestamp: <timestamp>" \
  -d '{
    "task_id": 66,
    "folder_name": "Test-Course-Complete",
    "secret_key": "<API_SECRET_KEY>",
    "timestamp": <timestamp>
  }'
```

---

## 🎯 KẾT LUẬN

**Tổng kết**:
- ✅ Infrastructure hoạt động tốt (workers, queue, email)
- ✅ API endpoints hoạt động đúng
- ⚠️ Enrollment có lỗi với test course URL
- ⚠️ Cần test với course URL thật để verify complete flow

**Next Steps**:
1. Fix enrollment error handling
2. Test với course URL thật
3. Monitor complete flow từ đầu đến cuối
4. Verify email được gửi khi order complete

---

**Scripts**:
- `check-download-process.sh` - Check download process
- `test-full-order-flow.sh` - Test complete order flow
