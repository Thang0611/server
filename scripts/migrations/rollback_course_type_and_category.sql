-- ============================================================================
-- ROLLBACK: Remove course_type and category from download_tasks
-- Purpose: Rollback migration add_course_type_and_category.sql
-- Date: 2026-01-XX
-- ============================================================================

-- Drop indexes first
ALTER TABLE download_tasks DROP INDEX IF EXISTS idx_category;
ALTER TABLE download_tasks DROP INDEX IF EXISTS idx_course_type;
ALTER TABLE download_tasks DROP INDEX IF EXISTS idx_course_url;

-- Drop columns
ALTER TABLE download_tasks DROP COLUMN IF EXISTS category;
ALTER TABLE download_tasks DROP COLUMN IF EXISTS course_type;

-- Verify rollback
DESCRIBE download_tasks;
SHOW INDEX FROM download_tasks;

SELECT '✅ Rollback completed: course_type and category removed from download_tasks' AS status;
