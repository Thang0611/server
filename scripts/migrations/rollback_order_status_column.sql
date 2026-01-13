-- Rollback Migration: Remove order_status column from orders table
-- Date: 2026-01-13
-- Purpose: Rollback the order_status feature if needed

-- Drop the index first
DROP INDEX IF EXISTS `idx_order_status` ON `orders`;

-- Remove the order_status column
ALTER TABLE `orders` 
DROP COLUMN `order_status`;

-- Verify rollback
DESCRIBE `orders`;
