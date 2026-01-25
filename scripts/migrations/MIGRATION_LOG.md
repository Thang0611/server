# Migration Log

## 2026-01-23: Add course_type and category to download_tasks

### Issue
- Error: `Unknown column 'course_type' in 'INSERT INTO'`
- Code đang cố insert `course_type` và `category` nhưng database thiếu columns

### Solution
- Created migration: `add_course_type_category_to_download_tasks.sql`
- Added columns:
  - `course_type` ENUM('temporary', 'permanent') NOT NULL DEFAULT 'temporary'
  - `category` VARCHAR(255) NULL
- Added indexes for performance
- Updated existing records: All 74 existing tasks set to 'temporary'

### Verification
```sql
DESCRIBE download_tasks;
-- course_type: enum('temporary','permanent') NOT NULL DEFAULT 'temporary'
-- category: varchar(255) NULL
```

### Status
✅ Migration completed successfully
✅ All existing records updated
✅ Services restarted
