# Database Migrations

This folder contains SQL migration scripts for database schema changes.

## Migration: Add order_status Column

**File:** `add_order_status_column.sql`  
**Date:** 2026-01-13  
**Purpose:** Track order fulfillment status separately from payment status

### What it does:
1. Adds `order_status` column to `orders` table
2. Migrates existing data appropriately
3. Creates index for performance

### How to run:

```bash
# Connect to MySQL
mysql -u root -p khoahocgiare_db

# Run the migration
source /root/server/scripts/migrations/add_order_status_column.sql;

# Or using mysql command line:
mysql -u root -p khoahocgiare_db < /root/server/scripts/migrations/add_order_status_column.sql
```

### Rollback (if needed):
```sql
-- Remove the column if you need to rollback
ALTER TABLE `orders` DROP COLUMN `order_status`;
DROP INDEX `idx_order_status` ON `orders`;
```

## Order Status Flow

```
pending → processing → completed
              ↓
            failed
```

- **pending**: Order created, payment not received yet
- **processing**: Payment received, tasks are being processed (enroll/download)
- **completed**: All tasks finished (success or failure)
- **failed**: Critical error in order processing

---

## Migration: Add course_type and category to download_tasks

**File:** `add_course_type_and_category.sql`  
**Date:** 2026-01-XX  
**Purpose:** Thêm field course_type (temporary/permanent) và category vào download_tasks để phân biệt khóa học từ trang chủ vs trang courses

### What it does:
1. Adds `course_type` ENUM('temporary', 'permanent') column với default 'temporary'
2. Adds `category` VARCHAR(255) column
3. Adds indexes: `idx_course_url`, `idx_course_type`, `idx_category`

### How to run:

```bash
mysql -u root -p khoahocgiare_db < /root/project/server/scripts/migrations/add_course_type_and_category.sql
```

### Rollback (if needed):
```sql
ALTER TABLE download_tasks DROP INDEX idx_category;
ALTER TABLE download_tasks DROP INDEX idx_course_type;
ALTER TABLE download_tasks DROP INDEX idx_course_url;
ALTER TABLE download_tasks DROP COLUMN category;
ALTER TABLE download_tasks DROP COLUMN course_type;
```

---

## Migration: Create courses table

**File:** `create_courses_table.sql`  
**Date:** 2026-01-XX  
**Purpose:** Tạo bảng courses để lưu danh sách khóa học permanent từ trang courses

### What it does:
1. Creates `courses` table với các fields: course_url, title, category, platform, etc.
2. Creates indexes: category, platform, status, bestseller
3. Unique constraint trên course_url

### How to run:

```bash
mysql -u root -p khoahocgiare_db < /root/project/server/scripts/migrations/create_courses_table.sql
```

### Rollback (if needed):
```sql
DROP TABLE IF EXISTS courses;
```

---

## Migration: Create curriculum tables

**File:** `create_curriculum_tables.sql`  
**Date:** 2026-01-XX  
**Purpose:** Tạo bảng curriculum_sections và curriculum_lectures để lưu thông tin đầy đủ của khóa học (sections và lectures)

### What it does:
1. Creates `curriculum_sections` table để lưu sections trong curriculum
2. Creates `curriculum_lectures` table để lưu lectures trong mỗi section
3. Adds `total_sections`, `total_lectures`, `total_duration_seconds` columns vào `courses` table
4. Creates indexes và foreign keys cho performance và data integrity

### Schema:
- **curriculum_sections**: course_id, section_id, section_index, title, lecture_count, duration_seconds
- **curriculum_lectures**: section_id, lecture_id, lecture_index, title, type, duration_seconds, is_previewable

### How to run:

```bash
mysql -u root -p khoahocgiare_db < /root/project/server/scripts/migrations/create_curriculum_tables.sql
```

### Rollback (if needed):
```sql
ALTER TABLE courses DROP COLUMN total_duration_seconds;
ALTER TABLE courses DROP COLUMN total_lectures;
ALTER TABLE courses DROP COLUMN total_sections;
DROP TABLE IF EXISTS curriculum_lectures;
DROP TABLE IF EXISTS curriculum_sections;
```
