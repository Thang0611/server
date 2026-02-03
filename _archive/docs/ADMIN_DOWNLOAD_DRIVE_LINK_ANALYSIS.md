# Phân Tích: Tại Sao drive_link Không Được Cập Nhật Vào Bảng courses Sau Khi Download Task Hoàn Thành

## Tổng Quan Vấn Đề

Sau khi download task hoàn thành (status = 'completed'), trường `drive_link` trong bảng `courses` vẫn không có dữ liệu.

## Luồng Xử Lý Hiện Tại

### 1. Khi Download Task Hoàn Thành

**File:** `server/src/services/webhook.service.js`

Khi Python worker hoàn thành download và gọi webhook `finalizeDownload()`:

```javascript
// Line 223-253: webhook.service.js
if (updateData.status === 'completed' && driveLink && task.course_type === 'permanent') {
  try {
    const adminDownloadService = require('./adminDownload.service');
    const updateResult = await adminDownloadService.updateCourseDriveLink(taskId, driveLink);
    
    if (updateResult.updated) {
      Logger.success('[Webhook] Updated courses.drive_link via adminDownload service', {...});
    } else {
      Logger.debug('[Webhook] Course update skipped', {
        taskId,
        reason: updateResult.reason  // ⚠️ Lý do bị skip
      });
    }
  } catch (courseUpdateError) {
    // Log error nhưng không fail webhook
    Logger.error('[Webhook] Failed to update courses.drive_link', courseUpdateError, {...});
  }
}
```

**Điều kiện để cập nhật:**
- ✅ `updateData.status === 'completed'`
- ✅ `driveLink` có giá trị
- ✅ `task.course_type === 'permanent'`

### 2. Hàm updateCourseDriveLink()

**File:** `server/src/services/adminDownload.service.js`

```javascript
// Line 303-368: adminDownload.service.js
const updateCourseDriveLink = async (taskId, driveLink) => {
  // 1. Tìm task
  const task = await DownloadTask.findByPk(taskId, {
    attributes: ['id', 'course_url', 'course_type', 'order_id']
  });

  // 2. Kiểm tra điều kiện admin download
  if (task.course_type !== 'permanent' || task.order_id !== null) {
    Logger.debug('[AdminDownload] Skipping course update - not an admin download', {
      taskId,
      courseType: task.course_type,
      orderId: task.order_id  // ⚠️ Nếu order_id !== null, sẽ skip
    });
    return { updated: false, reason: 'Not an admin download' };
  }

  // 3. Tìm course theo course_url
  const normalizedUrl = transformToSamsungUdemy(task.course_url) || task.course_url;
  const normalizedUrl2 = transformToNormalizeUdemyCourseUrl(task.course_url) || task.course_url;

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
    Logger.warn('[AdminDownload] Course not found in courses table', {
      taskId,
      courseUrl: task.course_url  // ⚠️ Course không tìm thấy
    });
    return { updated: false, reason: 'Course not found' };
  }

  // 4. Cập nhật drive_link
  await course.update({ drive_link: driveLink });
  
  return { updated: true, courseId: course.id, ... };
};
```

## Các Nguyên Nhân Có Thể

### ❌ Nguyên Nhân 1: Task Có order_id Không Null

**Vấn đề:** Điều kiện kiểm tra ở line 319 yêu cầu `task.order_id === null` để được coi là admin download.

```javascript
if (task.course_type !== 'permanent' || task.order_id !== null) {
  return { updated: false, reason: 'Not an admin download' };
}
```

**Nguyên nhân có thể:**
- Task được tạo với `order_id` không null (có thể do bug hoặc logic cũ)
- Task được tạo từ order flow nhưng có `course_type = 'permanent'`

**Cách kiểm tra:**
```sql
SELECT id, course_url, course_type, order_id, status, drive_link 
FROM download_tasks 
WHERE course_type = 'permanent' 
  AND status = 'completed' 
  AND drive_link IS NOT NULL
  AND order_id IS NOT NULL;  -- ⚠️ Nếu có kết quả, đây là vấn đề
```

### ❌ Nguyên Nhân 2: Không Tìm Thấy Course Trong Bảng courses

**Vấn đề:** URL trong `download_tasks.course_url` không khớp với `courses.course_url`.

**Nguyên nhân có thể:**
1. **URL format khác nhau:**
   - Task có URL: `https://samsungu.udemy.com/course/abc/`
   - Course có URL: `https://www.udemy.com/course/abc/`
   - Hoặc ngược lại

2. **URL có query parameters:**
   - Task: `https://www.udemy.com/course/abc/?couponCode=XYZ`
   - Course: `https://www.udemy.com/course/abc/`

3. **URL có trailing slash khác nhau:**
   - Task: `https://www.udemy.com/course/abc/`
   - Course: `https://www.udemy.com/course/abc`

4. **Course chưa được tạo trong bảng courses:**
   - Admin trigger download nhưng course chưa có trong DB

**Cách kiểm tra:**
```sql
-- So sánh URL giữa tasks và courses
SELECT 
  dt.id as task_id,
  dt.course_url as task_url,
  dt.course_type,
  dt.status,
  dt.drive_link as task_drive_link,
  c.id as course_id,
  c.course_url as course_url,
  c.drive_link as course_drive_link
FROM download_tasks dt
LEFT JOIN courses c ON (
  c.course_url = dt.course_url 
  OR c.course_url = REPLACE(dt.course_url, 'samsungu.', '')
  OR c.course_url = REPLACE(dt.course_url, 'www.', '')
)
WHERE dt.course_type = 'permanent'
  AND dt.status = 'completed'
  AND dt.drive_link IS NOT NULL
  AND dt.order_id IS NULL
  AND c.id IS NULL;  -- ⚠️ Nếu có kết quả, course không tìm thấy
```

### ❌ Nguyên Nhân 3: Lỗi Trong Quá Trình Cập Nhật

**Vấn đề:** Có exception xảy ra nhưng bị catch và chỉ log, không fail webhook.

**Cách kiểm tra logs:**
```bash
# Tìm log errors từ webhook
grep -i "Failed to update courses.drive_link" /root/project/server/logs/*.log

# Tìm log warnings về course not found
grep -i "Course not found in courses table" /root/project/server/logs/*.log

# Tìm log debug về skip update
grep -i "Course update skipped" /root/project/server/logs/*.log
```

### ❌ Nguyên Nhân 4: Task Không Có course_type = 'permanent'

**Vấn đề:** Task được tạo với `course_type = 'temporary'` thay vì `'permanent'`.

**Cách kiểm tra:**
```sql
SELECT id, course_url, course_type, order_id, status, drive_link 
FROM download_tasks 
WHERE status = 'completed' 
  AND drive_link IS NOT NULL
  AND course_type = 'temporary'  -- ⚠️ Nếu có kết quả, đây là vấn đề
  AND order_id IS NULL;
```

## Các Bước Debug

### Bước 1: Kiểm Tra Task Đã Hoàn Thành

```sql
SELECT 
  id,
  course_url,
  course_type,
  order_id,
  status,
  drive_link,
  created_at,
  updated_at
FROM download_tasks
WHERE status = 'completed'
  AND drive_link IS NOT NULL
  AND course_type = 'permanent'
ORDER BY updated_at DESC
LIMIT 10;
```

### Bước 2: Kiểm Tra Course Có Tồn Tại

Với mỗi `task_id` từ bước 1, kiểm tra:

```sql
-- Thay {task_course_url} bằng course_url từ task
SELECT id, title, course_url, drive_link
FROM courses
WHERE course_url = '{task_course_url}'
   OR course_url = REPLACE('{task_course_url}', 'samsungu.', '')
   OR course_url = REPLACE('{task_course_url}', 'www.', '');
```

### Bước 3: Kiểm Tra Logs

```bash
# Xem logs gần đây
tail -n 100 /root/project/server/logs/*.log | grep -i "adminDownload\|course.*drive_link\|updateCourseDriveLink"
```

### Bước 4: Test Thủ Công Hàm updateCourseDriveLink

Tạo script test:

```javascript
// test-update-drive-link.js
const adminDownloadService = require('./src/services/adminDownload.service');

async function test() {
  const taskId = process.argv[2]; // Task ID từ command line
  const driveLink = process.argv[3]; // Drive link test
  
  if (!taskId || !driveLink) {
    console.error('Usage: node test-update-drive-link.js <taskId> <driveLink>');
    process.exit(1);
  }
  
  try {
    const result = await adminDownloadService.updateCourseDriveLink(taskId, driveLink);
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
  
  process.exit(0);
}

test();
```

## Giải Pháp Đề Xuất

### Giải Pháp 1: Cải Thiện URL Matching

Thêm nhiều biến thể URL hơn khi tìm course:

```javascript
// Trong adminDownload.service.js
const findCourseByUrl = async (taskCourseUrl) => {
  const urlVariants = [
    taskCourseUrl,
    transformToSamsungUdemy(taskCourseUrl),
    transformToNormalizeUdemyCourseUrl(taskCourseUrl),
    taskCourseUrl.replace(/\/$/, ''), // Remove trailing slash
    taskCourseUrl + '/', // Add trailing slash
    taskCourseUrl.split('?')[0], // Remove query params
    taskCourseUrl.replace(/samsungu\./, 'www.'),
    taskCourseUrl.replace(/www\./, 'samsungu.')
  ].filter(Boolean); // Remove null/undefined
  
  // Remove duplicates
  const uniqueVariants = [...new Set(urlVariants)];
  
  return await Course.findOne({
    where: {
      course_url: { [Op.in]: uniqueVariants }
    }
  });
};
```

### Giải Pháp 2: Thêm Logging Chi Tiết

Thêm logging để debug dễ hơn:

```javascript
// Trong updateCourseDriveLink()
Logger.info('[AdminDownload] Attempting to update course', {
  taskId,
  taskCourseUrl: task.course_url,
  taskCourseType: task.course_type,
  taskOrderId: task.order_id,
  hasDriveLink: !!driveLink
});

// Sau khi tìm course
if (!course) {
  Logger.warn('[AdminDownload] Course not found - trying to find by similar URLs', {
    taskId,
    taskCourseUrl: task.course_url,
    normalizedUrl,
    normalizedUrl2,
    // Log tất cả courses có URL tương tự
    similarCourses: await Course.findAll({
      where: {
        course_url: { [Op.like]: `%${task.course_url.split('/').pop()}%` }
      },
      attributes: ['id', 'course_url']
    })
  });
}
```

### Giải Pháp 3: Thêm Fallback: Tìm Course Theo ID

Nếu có thể, lưu `course_id` vào task khi tạo:

```javascript
// Khi tạo task trong triggerAdminDownload()
task = await DownloadTask.create({
  course_url: transformedCourseUrl,
  course_id: course.id, // ✅ Thêm course_id
  // ... other fields
});

// Trong updateCourseDriveLink()
if (task.course_id) {
  const course = await Course.findByPk(task.course_id);
  if (course) {
    await course.update({ drive_link: driveLink });
    return { updated: true, courseId: course.id, ... };
  }
}
// Fallback to URL matching...
```

### Giải Pháp 4: Thêm Retry Logic

Nếu update fail, retry sau một khoảng thời gian:

```javascript
// Trong webhook.service.js
if (updateData.status === 'completed' && driveLink && task.course_type === 'permanent') {
  let retries = 0;
  const maxRetries = 3;
  
  while (retries < maxRetries) {
    try {
      const updateResult = await adminDownloadService.updateCourseDriveLink(taskId, driveLink);
      if (updateResult.updated) {
        break; // Success
      }
      
      if (updateResult.reason === 'Course not found') {
        // Wait a bit and retry (course might be created later)
        await new Promise(resolve => setTimeout(resolve, 5000));
        retries++;
      } else {
        break; // Other reason, don't retry
      }
    } catch (error) {
      if (retries < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        retries++;
      } else {
        throw error;
      }
    }
  }
}
```

## Checklist Debug

- [ ] Kiểm tra task có `order_id = null` không
- [ ] Kiểm tra task có `course_type = 'permanent'` không
- [ ] Kiểm tra task có `status = 'completed'` và `drive_link` không null không
- [ ] Kiểm tra course có tồn tại trong bảng `courses` không
- [ ] So sánh `course_url` giữa task và course (có khớp không)
- [ ] Kiểm tra logs để xem lý do skip/error
- [ ] Test hàm `updateCourseDriveLink()` thủ công với task_id cụ thể

## Kết Luận

Vấn đề có thể do một trong các nguyên nhân sau:
1. **Task có `order_id` không null** → Điều kiện check fail
2. **URL không khớp** → Không tìm thấy course
3. **Course chưa tồn tại** → Không có course để update
4. **Exception bị catch** → Lỗi nhưng không fail webhook

Cần kiểm tra từng nguyên nhân theo checklist trên để xác định chính xác vấn đề.
