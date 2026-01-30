-- ============================================================================
-- MIGRATION: Create courses table
-- Purpose: Tạo bảng courses để lưu danh sách khóa học permanent từ trang courses
-- Date: 2026-01-XX
-- ============================================================================

-- Drop table if exists (for re-running migration)
DROP TABLE IF EXISTS courses;

-- Create courses table
CREATE TABLE courses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  course_url TEXT NOT NULL,
  title VARCHAR(500) NOT NULL,
  thumbnail TEXT NULL,
  instructor VARCHAR(255) NULL,
  rating DECIMAL(3,2) NULL,
  students INT UNSIGNED NULL,
  duration VARCHAR(50) NULL,
  lectures INT UNSIGNED NULL,
  category VARCHAR(255) NULL,
  platform VARCHAR(50) NULL DEFAULT 'Udemy',
  description TEXT NULL,
  price DECIMAL(15, 0) NOT NULL DEFAULT 50000,
  original_price DECIMAL(15, 0) NULL,
  bestseller BOOLEAN DEFAULT FALSE,
  drive_link TEXT NULL COMMENT 'Link drive nếu đã download (từ download_tasks)',
  status ENUM('active', 'inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

-- Unique constraint on course_url (using prefix for TEXT field)
UNIQUE KEY unique_course_url (course_url(500)),
  INDEX idx_category (category),
  INDEX idx_platform (platform),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  INDEX idx_bestseller (bestseller)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Danh sách khóa học permanent từ trang courses';

-- Verify table creation
DESCRIBE courses;

SHOW INDEX FROM courses;

SELECT '✅ Migration completed: courses table created' AS status;