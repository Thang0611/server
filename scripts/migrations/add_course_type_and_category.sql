-- ============================================================================
-- MIGRATION: Add course_type and category to download_tasks
-- Purpose: Thêm field course_type (temporary/permanent) và category vào download_tasks
-- Date: 2026-01-XX
-- ============================================================================

-- Add course_type column
ALTER TABLE download_tasks 
ADD COLUMN course_type ENUM('temporary', 'permanent') NOT NULL DEFAULT 'temporary' 
  COMMENT 'Loại khóa học: temporary (trang chủ) hoặc permanent (trang courses)';

-- Add category column
ALTER TABLE download_tasks 
ADD COLUMN category VARCHAR(255) NULL 
  COMMENT 'Category của khóa học (Lập trình, Thiết kế, Marketing, etc.)';

-- Add index for course_url (using prefix index for TEXT field)
ALTER TABLE download_tasks 
ADD INDEX idx_course_url (course_url(255));

-- Add index for course_type
ALTER TABLE download_tasks 
ADD INDEX idx_course_type (course_type);

-- Add index for category
ALTER TABLE download_tasks 
ADD INDEX idx_category (category);

-- Verify changes
DESCRIBE download_tasks;
SHOW INDEX FROM download_tasks;

SELECT '✅ Migration completed: course_type and category added to download_tasks' AS status;
