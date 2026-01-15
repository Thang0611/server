-- ============================================================================
-- ORDER AUDIT LOGS TABLE
-- Purpose: Track all state changes and critical events for paid orders
-- Author: Senior System Architect
-- Date: 2026-01-14
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_audit_logs (
  -- Primary Key
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  
  -- Foreign Keys
  order_id INT UNSIGNED NOT NULL,
  task_id INT UNSIGNED NULL,  -- NULL for order-level events
  
  -- Event Information
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
  
  -- Event Details
  event_category ENUM('payment', 'enrollment', 'download', 'notification', 'system') NOT NULL,
  severity ENUM('info', 'warning', 'error', 'critical') DEFAULT 'info',
  
  -- State Tracking
  previous_status VARCHAR(50) NULL,
  new_status VARCHAR(50) NULL,
  
  -- Message & Context
  message TEXT NOT NULL,
  details JSON NULL COMMENT 'Additional context: API responses, error stack traces, etc.',
  
  -- Metadata
  source VARCHAR(50) NOT NULL COMMENT 'Source of log: node_worker, python_worker, webhook_handler',
  user_agent VARCHAR(255) NULL,
  ip_address VARCHAR(45) NULL,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes for Performance
  INDEX idx_order_id (order_id),
  INDEX idx_task_id (task_id),
  INDEX idx_event_type (event_type),
  INDEX idx_severity (severity),
  INDEX idx_created_at (created_at),
  INDEX idx_order_category (order_id, event_category),
  INDEX idx_order_severity (order_id, severity),
  
  -- Foreign Key Constraints
  CONSTRAINT fk_audit_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_audit_task FOREIGN KEY (task_id) REFERENCES download_tasks(id) ON DELETE CASCADE
  
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
CREATE PROCEDURE sp_log_audit_event(
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
-- SAMPLE DATA (For Testing)
-- ============================================================================

-- Log payment received
-- CALL sp_log_audit_event(
--   1,                          -- order_id
--   NULL,                       -- task_id
--   'payment_received',         -- event_type
--   'payment',                  -- event_category
--   'info',                     -- severity
--   'Payment webhook received from SEPAY', -- message
--   '{"amount": 300000, "bank": "VCB"}',   -- details
--   'pending',                  -- previous_status
--   'paid',                     -- new_status
--   'webhook_handler'           -- source
-- );
