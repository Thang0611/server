-- ============================================================================
-- MIGRATION: Create curriculum tables
-- Purpose: Tạo bảng curriculum_sections và curriculum_lectures để lưu thông tin đầy đủ của khóa học
-- Date: 2026-01-XX
-- ============================================================================

-- Drop tables if exists (for re-running migration)
DROP TABLE IF EXISTS curriculum_lectures;
DROP TABLE IF EXISTS curriculum_sections;

-- ============================================================================
-- TABLE: curriculum_sections
-- ============================================================================
CREATE TABLE curriculum_sections (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  course_id INT UNSIGNED NOT NULL,
  section_id VARCHAR(100) NULL COMMENT 'ID từ Udemy (có thể là string)',
  section_index INT UNSIGNED NOT NULL COMMENT 'Thứ tự section trong khóa học',
  title VARCHAR(500) NOT NULL,
  lecture_count INT UNSIGNED DEFAULT 0,
  duration_seconds INT UNSIGNED DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (course_id) REFERENCES courses(id) ON UPDATE CASCADE ON DELETE CASCADE,
  INDEX idx_course_id (course_id),
  INDEX idx_section_index (section_index),
  UNIQUE KEY unique_course_section (course_id, section_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Sections trong curriculum của khóa học';

-- ============================================================================
-- TABLE: curriculum_lectures
-- ============================================================================
CREATE TABLE curriculum_lectures (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  section_id INT UNSIGNED NOT NULL,
  lecture_id VARCHAR(100) NULL COMMENT 'ID từ Udemy (có thể là string)',
  lecture_index INT UNSIGNED NOT NULL COMMENT 'Thứ tự lecture trong section',
  title VARCHAR(500) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'VIDEO_LECTURE' COMMENT 'VIDEO_LECTURE, ARTICLE_LECTURE, QUIZ, etc.',
  duration_seconds INT UNSIGNED DEFAULT 0,
  is_previewable BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (section_id) REFERENCES curriculum_sections(id) ON UPDATE CASCADE ON DELETE CASCADE,
  INDEX idx_section_id (section_id),
  INDEX idx_lecture_index (lecture_index),
  INDEX idx_type (type),
  UNIQUE KEY unique_section_lecture (section_id, lecture_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Lectures trong mỗi section của curriculum';

-- ============================================================================
-- Add curriculum summary fields to courses table
-- ============================================================================
ALTER TABLE courses 
ADD COLUMN total_sections INT UNSIGNED NULL COMMENT 'Tổng số sections',
ADD COLUMN total_lectures INT UNSIGNED NULL COMMENT 'Tổng số lectures',
ADD COLUMN total_duration_seconds INT UNSIGNED NULL COMMENT 'Tổng thời lượng (giây)';

-- Verify tables
DESCRIBE curriculum_sections;
DESCRIBE curriculum_lectures;
SHOW INDEX FROM curriculum_sections;
SHOW INDEX FROM curriculum_lectures;

SELECT '✅ Migration completed: curriculum tables created' AS status;
