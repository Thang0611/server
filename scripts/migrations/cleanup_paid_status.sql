-- Migration: Cleanup 'paid' status in download_tasks
-- Date: 2026-01-13
-- Purpose: Convert any remaining 'paid' status tasks to 'pending'

-- Check current status distribution
SELECT 
    status, 
    COUNT(*) as count,
    MIN(created_at) as oldest,
    MAX(created_at) as newest
FROM download_tasks
GROUP BY status
ORDER BY count DESC;

-- Update any 'paid' status tasks to 'pending'
UPDATE download_tasks
SET status = 'pending'
WHERE status = 'paid';

-- Show affected rows
SELECT ROW_COUNT() as updated_count;

-- Verify cleanup
SELECT 
    status, 
    COUNT(*) as count
FROM download_tasks
GROUP BY status
ORDER BY 
    FIELD(status, 'pending', 'processing', 'enrolled', 'completed', 'failed', 'paid');
