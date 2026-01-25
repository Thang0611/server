# Test Course Purchase Feature

## Tổng quan

Test script này kiểm tra các chức năng mới của Course Purchase Feature:
1. **Check Existing Download Service** - Kiểm tra logic tìm existing download cho permanent courses
2. **Create Order với course_type và category** - Test tạo order với các field mới
3. **Payment Webhook với Existing Download Check** - Test logic reuse drive_link cho permanent courses

## Prerequisites

1. **Database Migrations**: Cần chạy migrations trước
   ```bash
   cd /root/project/server/scripts/migrations
   mysql -u root -p khoahocgiare_db < add_course_type_and_category.sql
   mysql -u root -p khoahocgiare_db < create_courses_table.sql
   ```

2. **Environment Variables**: Đảm bảo `.env` có:
   - `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`
   - `TEST_EMAIL` (optional, default: test@example.com)

## Cách chạy tests

### Option 1: Chạy setup script (tự động chạy migrations + tests)

```bash
cd /root/project/server/scripts
./test-course-purchase-setup.sh
```

### Option 2: Chạy test script trực tiếp

```bash
cd /root/project/server
node scripts/test-course-purchase-feature.js
```

## Test Cases

### Test 1: Check Existing Download Service

**Scenarios:**
- ✅ Temporary course → Should return `null` (không tìm existing download)
- ✅ Permanent course without existing download → Should return `null`
- ✅ Permanent course with existing drive_link → Should return task với drive_link

**Expected Results:**
- Temporary courses luôn phải download lại
- Permanent courses chỉ reuse nếu đã có drive_link

### Test 2: Create Order with course_type and category

**Scenarios:**
- ✅ Create order với `courseType: 'temporary'` → Task có `course_type = 'temporary'`
- ✅ Create order với `courseType: 'permanent'` và `category: 'Lập trình'` → Task có đúng course_type và category

**Expected Results:**
- Tasks được tạo với đúng `course_type` và `category` từ request

### Test 3: Payment Webhook with Existing Download Check

**Scenarios:**
- ✅ Tạo permanent course với existing drive_link
- ✅ Tạo order mới với cùng permanent course
- ✅ Simulate payment webhook
- ✅ Kiểm tra task mới có reuse existing drive_link và được mark completed

**Expected Results:**
- Permanent course với existing drive_link → Grant access ngay, mark completed
- Không cần enroll/download lại

## Test Output

Test script sẽ hiển thị:
- ✅ **PASSED**: Tests thành công
- ⚠️ **WARNINGS**: Cảnh báo (không phải lỗi)
- ❌ **FAILED**: Tests thất bại

Ví dụ output:
```
============================================================
🧪 COURSE PURCHASE FEATURE TEST SUITE
============================================================

📋 Test: Check Existing Download Service
------------------------------------------------------------
✅ Temporary course correctly returns null
✅ Permanent course without existing download correctly returns null
✅ Created test task 123 with drive_link
✅ Found existing download: https://drive.google.com/drive/folders/test123

📋 Test: Create Order with course_type and category
------------------------------------------------------------
✅ Order created: DH000001 (ID: 1)
✅ Task has correct course_type: temporary
✅ Order created: DH000002 (ID: 2)
✅ Task has correct course_type: permanent
✅ Task has correct category: Lập trình

📋 Test: Payment Webhook with Existing Download Check
------------------------------------------------------------
✅ Created existing task 124 with drive_link
✅ New order created: DH000003 (ID: 3)
✅ Webhook processed: {...}
✅ Task 125 was marked as completed with drive_link: https://drive.google.com/drive/folders/existing123

============================================================
📊 TEST SUMMARY
============================================================

✅ PASSED: 8 test(s)
  ✓ CheckExistingDownload: Temporary course returns null
  ✓ CheckExistingDownload: Permanent course with drive_link is found
  ✓ CreateOrder: Temporary course_type is set correctly
  ✓ CreateOrder: Permanent course_type is set correctly
  ✓ CreateOrder: Category is set correctly
  ✓ PaymentWebhook: Permanent course reused existing drive_link

✅ All tests passed!
```

## Troubleshooting

### Error: "Column 'course_type' doesn't exist"
- **Solution**: Chạy migrations trước:
  ```bash
  mysql -u root -p khoahocgiare_db < scripts/migrations/add_course_type_and_category.sql
  ```

### Error: "Table 'courses' doesn't exist"
- **Solution**: Chạy migration tạo bảng courses:
  ```bash
  mysql -u root -p khoahocgiare_db < scripts/migrations/create_courses_table.sql
  ```

### Error: "Cannot find module '../src/services/checkExistingDownload.service'"
- **Solution**: Đảm bảo file `server/src/services/checkExistingDownload.service.js` đã được tạo

### Tests fail với "Task course_type is incorrect"
- **Solution**: Kiểm tra xem `download.service.js` đã được update để truyền `course_type` và `category` chưa

## Notes

- Tests sẽ tự động cleanup test data sau khi chạy
- Test data được tạo với prefix "TEST" hoặc "EXIST" để dễ identify
- Nếu test fail, kiểm tra logs trong `server/logs/` để debug
