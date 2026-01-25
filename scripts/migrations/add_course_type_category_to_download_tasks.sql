-- ============================================================================
-- MIGRATION: Add course_type and category columns to download_tasks
-- Purpose: Thêm columns course_type và category vào bảng download_tasks
-- Date: 2026-01-23
-- ============================================================================

USE `udemy_bot`;

-- Add course_type column
ALTER TABLE `download_tasks`
ADD COLUMN IF NOT EXISTS `course_type` ENUM('temporary', 'permanent') NOT NULL DEFAULT 'temporary' 
  COMMENT 'Loại khóa học: temporary (trang chủ) hoặc permanent (trang courses)' 
  AFTER `error_log`;

-- Add category column
ALTER TABLE `download_tasks`
ADD COLUMN IF NOT EXISTS `category` VARCHAR(255) NULL 
  COMMENT 'Category của khóa học (Lập trình, Thiết kế, Marketing, etc.)' 
  AFTER `course_type`;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS `idx_course_type` ON `download_tasks` (`course_type`);
CREATE INDEX IF NOT EXISTS `idx_category` ON `download_tasks` (`category`);

-- Update existing records: Set course_type = 'temporary' for all existing records
UPDATE `download_tasks` 
SET `course_type` = 'temporary' 
WHERE `course_type` IS NULL OR `course_type` = '';

-- Verify
SELECT 
  'Migration completed' AS status,
  COUNT(*) AS total_tasks,
  COUNT(CASE WHEN course_type = 'temporary' THEN 1 END) AS temporary_count,
  COUNT(CASE WHEN course_type = 'permanent' THEN 1 END) AS permanent_count
FROM `download_tasks`;

SELECT '✅ Columns course_type and category added successfully!' AS status;
