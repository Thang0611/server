# Database Migrations

This folder contains SQL migration scripts for database schema changes.

## Migration: Add order_status Column

**File:** `add_order_status_column.sql`  
**Date:** 2026-01-13  
**Purpose:** Track order fulfillment status separately from payment status

### What it does:
1. Adds `order_status` column to `orders` table
2. Migrates existing data appropriately
3. Creates index for performance

### How to run:

```bash
# Connect to MySQL
mysql -u root -p khoahocgiare_db

# Run the migration
source /root/server/scripts/migrations/add_order_status_column.sql;

# Or using mysql command line:
mysql -u root -p khoahocgiare_db < /root/server/scripts/migrations/add_order_status_column.sql
```

### Rollback (if needed):
```sql
-- Remove the column if you need to rollback
ALTER TABLE `orders` DROP COLUMN `order_status`;
DROP INDEX `idx_order_status` ON `orders`;
```

## Order Status Flow

```
pending → processing → completed
              ↓
            failed
```

- **pending**: Order created, payment not received yet
- **processing**: Payment received, tasks are being processed (enroll/download)
- **completed**: All tasks finished (success or failure)
- **failed**: Critical error in order processing
