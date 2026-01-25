# Database Migration Guide

## Tổng quan

Các migration này thêm hỗ trợ cho chức năng mua khóa học với:
- Phân loại khóa học: `temporary` (trang chủ) vs `permanent` (trang courses)
- Category filter cho khóa học
- Bảng `courses` để lưu danh sách khóa học permanent

## Migration Files

### 1. `add_course_type_and_category.sql`
Thêm vào bảng `download_tasks`:
- `course_type` ENUM('temporary', 'permanent') - default 'temporary'
- `category` VARCHAR(255) - category của khóa học
- Indexes: `idx_course_url`, `idx_course_type`, `idx_category`

### 2. `create_courses_table.sql`
Tạo bảng mới `courses` để lưu danh sách khóa học permanent với đầy đủ thông tin.

### 3. `create_curriculum_tables.sql`
Tạo bảng `curriculum_sections` và `curriculum_lectures` để lưu thông tin đầy đủ của khóa học:
- `curriculum_sections`: Lưu sections trong curriculum
- `curriculum_lectures`: Lưu lectures trong mỗi section
- Thêm `total_sections`, `total_lectures`, `total_duration_seconds` vào bảng `courses`

## Cách chạy migrations

### Option 1: Chạy từng migration riêng lẻ

```bash
cd /root/project/server/scripts/migrations

# Migration 1: Thêm course_type và category
mysql -u root -p khoahocgiare_db < add_course_type_and_category.sql

# Migration 2: Tạo bảng courses
mysql -u root -p khoahocgiare_db < create_courses_table.sql

# Migration 3: Tạo bảng curriculum
mysql -u root -p khoahocgiare_db < create_curriculum_tables.sql
```

### Option 2: Sử dụng helper script

```bash
cd /root/project/server/scripts

# Xem danh sách migrations
./run_migrations.sh

# Chạy migration cụ thể
./run_migrations.sh migrations/add_course_type_and_category.sql
./run_migrations.sh migrations/create_courses_table.sql
./run_migrations.sh migrations/create_curriculum_tables.sql
```

### Option 3: Chạy trong MySQL console

```sql
-- Kết nối MySQL
mysql -u root -p khoahocgiare_db

-- Chạy migration
source /root/project/server/scripts/migrations/add_course_type_and_category.sql;
source /root/project/server/scripts/migrations/create_courses_table.sql;
source /root/project/server/scripts/migrations/create_curriculum_tables.sql;
```

## Verify migrations

Sau khi chạy migrations, kiểm tra:

```sql
-- Kiểm tra download_tasks có course_type và category
DESCRIBE download_tasks;
SHOW INDEX FROM download_tasks;

-- Kiểm tra bảng courses đã được tạo
DESCRIBE courses;
SHOW INDEX FROM courses;

-- Kiểm tra bảng curriculum
DESCRIBE curriculum_sections;
DESCRIBE curriculum_lectures;
SHOW INDEX FROM curriculum_sections;
SHOW INDEX FROM curriculum_lectures;

-- Kiểm tra dữ liệu
SELECT course_type, COUNT(*) FROM download_tasks GROUP BY course_type;
SELECT category, COUNT(*) FROM download_tasks WHERE category IS NOT NULL GROUP BY category;
```

## Rollback (nếu cần)

### Rollback course_type và category

```bash
mysql -u root -p khoahocgiare_db < migrations/rollback_course_type_and_category.sql
```

Hoặc thủ công:

```sql
ALTER TABLE download_tasks DROP INDEX IF EXISTS idx_category;
ALTER TABLE download_tasks DROP INDEX IF EXISTS idx_course_type;
ALTER TABLE download_tasks DROP INDEX IF EXISTS idx_course_url;
ALTER TABLE download_tasks DROP COLUMN IF EXISTS category;
ALTER TABLE download_tasks DROP COLUMN IF EXISTS course_type;
```

### Rollback courses table

```sql
DROP TABLE IF EXISTS courses;
```

### Rollback curriculum tables

```bash
mysql -u root -p khoahocgiare_db < migrations/rollback_curriculum_tables.sql
```

Hoặc thủ công:

```sql
ALTER TABLE courses DROP COLUMN IF EXISTS total_duration_seconds;
ALTER TABLE courses DROP COLUMN IF EXISTS total_lectures;
ALTER TABLE courses DROP COLUMN IF EXISTS total_sections;
DROP TABLE IF EXISTS curriculum_lectures;
DROP TABLE IF EXISTS curriculum_sections;
```

## Lưu ý

1. **Backward Compatibility**: 
   - Default `course_type = 'temporary'` đảm bảo các record cũ vẫn hoạt động
   - Các task cũ không có `course_type` sẽ được xử lý như `temporary`

2. **Index Performance**:
   - Index trên `course_url(255)` giúp tìm kiếm existing download nhanh hơn
   - Index trên `category` giúp filter courses nhanh hơn

3. **Data Migration**:
   - Các task hiện tại sẽ có `course_type = 'temporary'` (default)
   - Cần update thủ công nếu muốn đánh dấu task cũ là `permanent`

## Next Steps

Sau khi chạy migrations:
1. ✅ Database schema đã được cập nhật
2. ⏭️ Tiếp theo: Update backend services để sử dụng các field mới
3. ⏭️ Tiếp theo: Update frontend để truyền course_type và category
