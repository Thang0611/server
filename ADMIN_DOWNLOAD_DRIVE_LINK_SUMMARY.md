# Tóm Tắt: Vấn Đề drive_link Không Được Cập Nhật Vào Bảng courses

## Vấn Đề

Sau khi download task hoàn thành (status = 'completed'), trường `drive_link` trong bảng `courses` vẫn không có dữ liệu.

## Luồng Xử Lý Hiện Tại

### 1. Khi Download Hoàn Thành

Khi Python worker hoàn thành download, nó gọi webhook `finalizeDownload()` trong `webhook.service.js`:

```javascript
// Điều kiện để cập nhật courses.drive_link:
if (updateData.status === 'completed' && driveLink && task.course_type === 'permanent') {
  const updateResult = await adminDownloadService.updateCourseDriveLink(taskId, driveLink);
}
```

### 2. Hàm updateCourseDriveLink()

Hàm này có 2 điều kiện kiểm tra:

**Điều kiện 1:** Task phải là admin download
```javascript
if (task.course_type !== 'permanent' || task.order_id !== null) {
  return { updated: false, reason: 'Not an admin download' };
}
```
→ Cần: `course_type === 'permanent'` VÀ `order_id === null`

**Điều kiện 2:** Tìm course theo URL
```javascript
const course = await Course.findOne({
  where: {
    [Op.or]: [
      { course_url: task.course_url },
      { course_url: normalizedUrl },
      { course_url: normalizedUrl2 }
    ]
  }
});

if (!course) {
  return { updated: false, reason: 'Course not found' };
}
```

## Các Nguyên Nhân Có Thể

### ❌ 1. Task Có order_id Không Null

**Vấn đề:** Task được tạo với `order_id` không null, nên điều kiện check fail.

**Cách kiểm tra:**
```sql
SELECT id, course_url, course_type, order_id, status, drive_link 
FROM download_tasks 
WHERE course_type = 'permanent' 
  AND status = 'completed' 
  AND drive_link IS NOT NULL
  AND order_id IS NOT NULL;
```

### ❌ 2. URL Không Khớp - Không Tìm Thấy Course

**Vấn đề:** URL trong `download_tasks.course_url` không khớp với `courses.course_url`.

**Nguyên nhân:**
- Format URL khác nhau (samsungu.udemy.com vs www.udemy.com)
- Có/không có query parameters
- Có/không có trailing slash
- Course chưa được tạo trong bảng courses

**Cách kiểm tra:**
```sql
-- So sánh URL giữa tasks và courses
SELECT 
  dt.id as task_id,
  dt.course_url as task_url,
  c.id as course_id,
  c.course_url as course_url
FROM download_tasks dt
LEFT JOIN courses c ON (
  c.course_url = dt.course_url 
  OR c.course_url = REPLACE(dt.course_url, 'samsungu.', '')
)
WHERE dt.course_type = 'permanent'
  AND dt.status = 'completed'
  AND dt.drive_link IS NOT NULL
  AND dt.order_id IS NULL
  AND c.id IS NULL;  -- Nếu có kết quả, course không tìm thấy
```

### ❌ 3. Lỗi Trong Quá Trình Cập Nhật

**Vấn đề:** Có exception xảy ra nhưng bị catch và chỉ log, không fail webhook.

**Cách kiểm tra logs:**
```bash
grep -i "Failed to update courses.drive_link" /root/project/server/logs/*.log
grep -i "Course not found in courses table" /root/project/server/logs/*.log
grep -i "Course update skipped" /root/project/server/logs/*.log
```

## Cách Debug

### Bước 1: Chạy Script Debug

```bash
# Xem danh sách tasks hoàn thành gần đây
node scripts/debug-admin-drive-link.js

# Debug một task cụ thể
node scripts/debug-admin-drive-link.js <task_id>
```

Script này sẽ:
- ✅ Kiểm tra điều kiện admin download
- ✅ Tìm course theo URL
- ✅ So sánh drive_link giữa task và course
- ✅ Đưa ra gợi ý giải pháp

### Bước 2: Kiểm Tra Thủ Công

```sql
-- 1. Tìm tasks đã hoàn thành
SELECT id, course_url, course_type, order_id, status, drive_link
FROM download_tasks
WHERE status = 'completed'
  AND drive_link IS NOT NULL
  AND course_type = 'permanent'
ORDER BY updated_at DESC
LIMIT 10;

-- 2. Với mỗi task, tìm course tương ứng
SELECT id, title, course_url, drive_link
FROM courses
WHERE course_url LIKE '%<course_slug>%';
```

## Giải Pháp Đề Xuất

### 1. Cải Thiện URL Matching

Thêm nhiều biến thể URL hơn khi tìm course (xem file `ADMIN_DOWNLOAD_DRIVE_LINK_ANALYSIS.md`).

### 2. Thêm Logging Chi Tiết

Thêm logging để dễ debug hơn (xem file `ADMIN_DOWNLOAD_DRIVE_LINK_ANALYSIS.md`).

### 3. Lưu course_id Vào Task

Nếu có thể, lưu `course_id` vào task khi tạo để tránh phải match URL:

```javascript
// Khi tạo task
task = await DownloadTask.create({
  course_url: transformedCourseUrl,
  course_id: course.id, // ✅ Thêm course_id
  // ...
});

// Khi update
if (task.course_id) {
  const course = await Course.findByPk(task.course_id);
  // ...
}
```

### 4. Thêm Retry Logic

Nếu update fail, retry sau một khoảng thời gian (xem file `ADMIN_DOWNLOAD_DRIVE_LINK_ANALYSIS.md`).

## Checklist Debug

- [ ] Kiểm tra task có `order_id = null` không
- [ ] Kiểm tra task có `course_type = 'permanent'` không  
- [ ] Kiểm tra task có `status = 'completed'` và `drive_link` không null không
- [ ] Kiểm tra course có tồn tại trong bảng `courses` không
- [ ] So sánh `course_url` giữa task và course (có khớp không)
- [ ] Kiểm tra logs để xem lý do skip/error
- [ ] Chạy script debug: `node scripts/debug-admin-drive-link.js <task_id>`

## Files Liên Quan

- `server/src/services/webhook.service.js` - Xử lý webhook khi download hoàn thành
- `server/src/services/adminDownload.service.js` - Hàm `updateCourseDriveLink()`
- `server/scripts/debug-admin-drive-link.js` - Script debug
- `server/ADMIN_DOWNLOAD_DRIVE_LINK_ANALYSIS.md` - Phân tích chi tiết

## Kết Luận

Vấn đề có thể do một trong các nguyên nhân:
1. **Task có `order_id` không null** → Điều kiện check fail
2. **URL không khớp** → Không tìm thấy course
3. **Course chưa tồn tại** → Không có course để update
4. **Exception bị catch** → Lỗi nhưng không fail webhook

**Cách nhanh nhất để debug:** Chạy script `debug-admin-drive-link.js` với task_id cụ thể.
