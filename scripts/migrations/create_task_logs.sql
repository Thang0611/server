-- ============================================================================
-- TASK LOGS TABLE
-- Purpose: Structured logging for download tasks with progress tracking
-- Author: Unified Logger System
-- Date: 2026-01-15
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_logs (
  -- Primary Key
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  
  -- Foreign Keys
  task_id INT UNSIGNED NOT NULL,
  order_id INT UNSIGNED NOT NULL,
  
  -- Log Level & Category
  level ENUM('debug', 'info', 'warn', 'error', 'critical') NOT NULL DEFAULT 'info',
  category ENUM('download', 'upload', 'enrollment', 'system') NOT NULL DEFAULT 'download',
  
  -- Message & Context
  message TEXT NOT NULL,
  details JSON NULL COMMENT 'Additional context: progress, file names, errors, etc.',
  
  -- Progress Tracking
  progress_percent DECIMAL(5,2) NULL COMMENT 'Progress percentage (0-100)',
  current_file VARCHAR(500) NULL COMMENT 'Current file being processed',
  
  -- Metadata
  source VARCHAR(50) NOT NULL COMMENT 'Source: python_worker, node_worker, etc.',
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign Key Constraints
  FOREIGN KEY (task_id) REFERENCES download_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  
  -- Indexes for Performance
  INDEX idx_task_id (task_id),
  INDEX idx_order_id (order_id),
  INDEX idx_created_at (created_at),
  INDEX idx_level (level),
  INDEX idx_category (category),
  INDEX idx_task_level (task_id, level),
  INDEX idx_order_category (order_id, category),
  INDEX idx_task_created (task_id, created_at),
  INDEX idx_progress (task_id, progress_percent)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- COMMENTS
-- ============================================================================
-- This table stores structured logs for download tasks, including:
-- - Download progress updates (with percentage and current file)
-- - Task status changes
-- - Error messages with full context
-- - Enrollment events
-- - Upload progress
--
-- Benefits:
-- - Queryable by task_id, order_id, level, category
-- - Structured format (JSON details field)
-- - No race conditions (database handles concurrency)
-- - Can aggregate for Admin Dashboard
-- - Automatic cleanup via CASCADE on task/order deletion
-- ============================================================================
