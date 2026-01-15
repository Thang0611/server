-- ============================================================================
-- CREATE ALL TABLES - COMPLETE DATABASE SCHEMA
-- Purpose: Tạo lại toàn bộ database từ đầu
-- Date: 2026-01-14
-- ============================================================================

-- Drop existing tables if they exist (in reverse order of dependencies)
DROP TABLE IF EXISTS order_audit_logs;
DROP TABLE IF EXISTS download_tasks;
DROP TABLE IF EXISTS orders;

-- ============================================================================
-- TABLE: orders
-- ============================================================================
CREATE TABLE orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_code VARCHAR(50) NOT NULL UNIQUE,
  user_email VARCHAR(255) NOT NULL,
  total_amount DECIMAL(15, 0) NOT NULL DEFAULT 0,
  payment_status ENUM('pending', 'paid', 'cancelled', 'refunded') NOT NULL DEFAULT 'pending',
  order_status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending' 
    COMMENT 'Tracks overall order fulfillment: pending → processing → completed/failed',
  payment_gateway_data JSON NULL,
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_payment_status (payment_status),
  INDEX idx_order_status (order_status),
  INDEX idx_user_email (user_email),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Orders table - stores customer orders';

-- ============================================================================
-- TABLE: download_tasks
-- ============================================================================
CREATE TABLE download_tasks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NULL,
  email VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20) NULL,
  course_url TEXT NOT NULL,
  title VARCHAR(255) NULL,
  price DECIMAL(15, 0) NOT NULL DEFAULT 0 COMMENT 'Giá bán thực tế của khóa này trong đơn hàng',
  status ENUM('paid', 'pending', 'processing', 'enrolled', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  drive_link TEXT NULL,
  retry_count INT NOT NULL DEFAULT 0,
  error_log TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (order_id) REFERENCES orders(id) ON UPDATE CASCADE ON DELETE SET NULL,
  INDEX idx_order_id (order_id),
  INDEX idx_email (email),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Download tasks - individual courses to download per order';

-- ============================================================================
-- TABLE: order_audit_logs
-- ============================================================================
CREATE TABLE order_audit_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  task_id INT UNSIGNED NULL COMMENT 'NULL for order-level events',
  event_type ENUM(
    'order_created',
    'payment_received',
    'payment_verified',
    'task_created',
    'task_queued',
    'enrollment_started',
    'enrollment_success',
    'enrollment_failed',
    'download_started',
    'download_completed',
    'download_failed',
    'upload_started',
    'upload_completed',
    'upload_failed',
    'webhook_received',
    'email_sent',
    'order_completed',
    'order_failed',
    'status_change'
  ) NOT NULL,
  event_category ENUM('payment', 'enrollment', 'download', 'notification', 'system') NOT NULL,
  severity ENUM('info', 'warning', 'error', 'critical') NOT NULL DEFAULT 'info',
  previous_status VARCHAR(50) NULL,
  new_status VARCHAR(50) NULL,
  message TEXT NOT NULL,
  details JSON NULL COMMENT 'Additional context: API responses, error stack traces, etc.',
  source VARCHAR(50) NOT NULL COMMENT 'Source of log: node_worker, python_worker, webhook_handler',
  user_agent VARCHAR(255) NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (order_id) REFERENCES orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES download_tasks(id) ON UPDATE CASCADE ON DELETE CASCADE,
  INDEX idx_order_id (order_id),
  INDEX idx_task_id (task_id),
  INDEX idx_event_type (event_type),
  INDEX idx_severity (severity),
  INDEX idx_created_at (created_at),
  INDEX idx_order_category (order_id, event_category),
  INDEX idx_order_severity (order_id, severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Audit log for tracking all order and task state changes';

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View: Latest events per order
CREATE OR REPLACE VIEW v_order_latest_events AS
SELECT 
  o.id AS order_id,
  o.order_code,
  o.payment_status,
  o.order_status,
  oal.event_type,
  oal.message,
  oal.severity,
  oal.created_at AS last_event_at
FROM orders o
LEFT JOIN order_audit_logs oal ON o.id = oal.order_id
WHERE oal.id = (
  SELECT MAX(id) 
  FROM order_audit_logs 
  WHERE order_id = o.id
)
AND o.payment_status = 'paid';

-- View: Error summary for paid orders
CREATE OR REPLACE VIEW v_order_errors AS
SELECT 
  order_id,
  COUNT(*) AS error_count,
  GROUP_CONCAT(DISTINCT event_type) AS error_types,
  MAX(created_at) AS last_error_at
FROM order_audit_logs
WHERE severity IN ('error', 'critical')
AND order_id IN (SELECT id FROM orders WHERE payment_status = 'paid')
GROUP BY order_id;

-- ============================================================================
-- STORED PROCEDURES
-- ============================================================================

DELIMITER $$

-- Procedure: Log audit event
CREATE PROCEDURE IF NOT EXISTS sp_log_audit_event(
  IN p_order_id INT UNSIGNED,
  IN p_task_id INT UNSIGNED,
  IN p_event_type VARCHAR(50),
  IN p_event_category VARCHAR(50),
  IN p_severity VARCHAR(20),
  IN p_message TEXT,
  IN p_details JSON,
  IN p_previous_status VARCHAR(50),
  IN p_new_status VARCHAR(50),
  IN p_source VARCHAR(50)
)
BEGIN
  INSERT INTO order_audit_logs (
    order_id,
    task_id,
    event_type,
    event_category,
    severity,
    message,
    details,
    previous_status,
    new_status,
    source
  ) VALUES (
    p_order_id,
    p_task_id,
    p_event_type,
    p_event_category,
    p_severity,
    p_message,
    p_details,
    p_previous_status,
    p_new_status,
    p_source
  );
END$$

DELIMITER ;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Show all tables
SHOW TABLES;

-- Show table structures
DESCRIBE orders;
DESCRIBE download_tasks;
DESCRIBE order_audit_logs;

-- Show indexes
SHOW INDEX FROM orders;
SHOW INDEX FROM download_tasks;
SHOW INDEX FROM order_audit_logs;

SELECT '✅ Database schema created successfully!' AS status;
