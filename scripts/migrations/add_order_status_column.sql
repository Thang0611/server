-- Migration: Add order_status column to orders table
-- Date: 2026-01-13
-- Purpose: Track order fulfillment status (pending → processing → completed/failed)

-- Add order_status column with ENUM type
ALTER TABLE `orders` 
ADD COLUMN `order_status` ENUM('pending', 'processing', 'completed', 'failed') 
NOT NULL DEFAULT 'pending' 
COMMENT 'Tracks overall order fulfillment: pending → processing → completed/failed'
AFTER `payment_status`;

-- Update existing orders based on their current state
-- If payment_status is 'paid', set order_status to 'processing' (assuming still in progress)
UPDATE `orders` 
SET `order_status` = 'processing' 
WHERE `payment_status` = 'paid';

-- Keep 'pending' for orders that haven't been paid yet
UPDATE `orders` 
SET `order_status` = 'pending' 
WHERE `payment_status` IN ('pending', 'cancelled', 'refunded');

-- Create index for faster queries on order_status
CREATE INDEX `idx_order_status` ON `orders` (`order_status`);

-- Verify the migration
SELECT 
    order_code,
    payment_status,
    order_status,
    created_at
FROM `orders`
ORDER BY created_at DESC
LIMIT 10;
