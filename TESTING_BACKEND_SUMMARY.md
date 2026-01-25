# Backend Testing Summary - Course Purchase Feature

## ✅ Đã hoàn thành

### 1. Test Scripts Created

**File**: `server/scripts/test-course-purchase-feature.js`
- Test checkExistingDownload service
- Test createOrder với course_type và category
- Test payment webhook với existing download check

**File**: `server/scripts/test-course-purchase-setup.sh`
- Setup script tự động chạy migrations + tests

**File**: `server/scripts/TEST_COURSE_PURCHASE_README.md`
- Hướng dẫn chi tiết cách chạy tests

## 🧪 Test Cases

### Test 1: Check Existing Download Service
- ✅ Temporary course → Returns null (không tìm existing)
- ✅ Permanent course without existing → Returns null
- ✅ Permanent course with drive_link → Returns task với drive_link

### Test 2: Create Order
- ✅ Temporary course → Task có `course_type = 'temporary'`
- ✅ Permanent course → Task có `course_type = 'permanent'` và `category`

### Test 3: Payment Webhook
- ✅ Permanent course với existing drive_link → Reuse drive_link, mark completed ngay

## 🚀 Cách chạy tests

### Bước 1: Chạy migrations (nếu chưa chạy)

```bash
cd /root/project/server/scripts/migrations
mysql -u root -p khoahocgiare_db < add_course_type_and_category.sql
mysql -u root -p khoahocgiare_db < create_courses_table.sql
```

### Bước 2: Chạy tests

**Option A: Dùng setup script (tự động)**
```bash
cd /root/project/server/scripts
./test-course-purchase-setup.sh
```

**Option B: Chạy test script trực tiếp**
```bash
cd /root/project/server
node scripts/test-course-purchase-feature.js
```

## 📋 Checklist trước khi test

- [ ] Database migrations đã chạy
- [ ] Environment variables đã config (DB_NAME, DB_USER, DB_PASSWORD)
- [ ] Server có thể kết nối database
- [ ] File `checkExistingDownload.service.js` đã được tạo
- [ ] Models đã được update (DownloadTask có course_type và category)

## 🔍 Expected Results

Nếu tất cả tests pass, bạn sẽ thấy:
```
✅ PASSED: 8 test(s)
  ✓ CheckExistingDownload: Temporary course returns null
  ✓ CheckExistingDownload: Permanent course with drive_link is found
  ✓ CreateOrder: Temporary course_type is set correctly
  ✓ CreateOrder: Permanent course_type is set correctly
  ✓ CreateOrder: Category is set correctly
  ✓ PaymentWebhook: Permanent course reused existing drive_link

✅ All tests passed!
```

## ⚠️ Troubleshooting

### Lỗi: "Column 'course_type' doesn't exist"
→ Chạy migrations trước

### Lỗi: "Cannot find module '../src/services/checkExistingDownload.service'"
→ Kiểm tra file đã được tạo chưa

### Lỗi: "Task course_type is incorrect"
→ Kiểm tra `download.service.js` đã update chưa

## 📝 Notes

- Tests tự động cleanup test data
- Test data có prefix "TEST" hoặc "EXIST"
- Xem logs trong `server/logs/` nếu cần debug

## 🎯 Next Steps

Sau khi tests pass:
1. ✅ Backend logic đã hoạt động đúng
2. ⏭️ Tiếp tục với Frontend Changes
3. ⏭️ Test integration end-to-end
