-- ============================================================================
-- ROLLBACK: Remove curriculum tables
-- Purpose: Rollback changes made by create_curriculum_tables.sql
-- Date: 2026-01-XX
-- ============================================================================

-- Remove curriculum summary fields from courses table
ALTER TABLE courses 
DROP COLUMN IF EXISTS total_duration_seconds,
DROP COLUMN IF EXISTS total_lectures,
DROP COLUMN IF EXISTS total_sections;

-- Drop curriculum tables (in reverse order of dependencies)
DROP TABLE IF EXISTS curriculum_lectures;
DROP TABLE IF EXISTS curriculum_sections;

SELECT '✅ Rollback completed: curriculum tables removed' AS status;
