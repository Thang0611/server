# 📊 SQL QUERIES FOR PAID ORDERS DASHBOARD

**Quick Reference for Admin Dashboard Implementation**  
**Date:** January 14, 2026

---

## 🔍 FILTER LOGIC: PAID ORDERS ONLY

### Core Filter (CRITICAL)

```sql
WHERE payment_status = 'paid'
```

This filter is **mandatory** for all dashboard queries to ensure only paid orders are displayed.

---

## 📋 QUERY 1: GET PAID ORDERS WITH HIERARCHICAL DATA

**Purpose:** Fetch orders with their tasks for the main dashboard view

```sql
SELECT 
  -- Order Information
  o.id AS order_id,
  o.order_code,
  o.user_email,
  o.order_status,
  o.payment_status,
  o.total_amount,
  o.created_at AS order_created,
  o.updated_at AS order_updated,
  
  -- Task Statistics
  COUNT(dt.id) AS total_tasks,
  SUM(CASE WHEN dt.status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks,
  SUM(CASE WHEN dt.status = 'failed' THEN 1 ELSE 0 END) AS failed_tasks,
  SUM(CASE WHEN dt.status IN ('processing', 'enrolled', 'pending') THEN 1 ELSE 0 END) AS processing_tasks,
  
  -- Progress Calculation
  ROUND(
    (SUM(CASE WHEN dt.status = 'completed' THEN 1 ELSE 0 END) / COUNT(dt.id)) * 100,
    0
  ) AS progress_percentage
  
FROM orders o
LEFT JOIN download_tasks dt ON o.id = dt.order_id

-- ✅ CRITICAL: Only paid orders
WHERE o.payment_status = 'paid'

GROUP BY o.id, o.order_code, o.user_email, o.order_status, o.payment_status, o.total_amount, o.created_at, o.updated_at

-- Newest first
ORDER BY o.created_at DESC

-- Pagination
LIMIT 20 OFFSET 0;
```

**Expected Result:**

```json
{
  "order_id": 123,
  "order_code": "DH123456",
  "user_email": "customer@example.com",
  "order_status": "processing",
  "payment_status": "paid",
  "total_amount": 300000,
  "order_created": "2026-01-14 10:30:00",
  "order_updated": "2026-01-14 11:00:00",
  "total_tasks": 3,
  "completed_tasks": 1,
  "failed_tasks": 0,
  "processing_tasks": 2,
  "progress_percentage": 33
}
```

---

## 📋 QUERY 2: GET ORDER DETAILS WITH TASKS

**Purpose:** Fetch detailed order information including all tasks

```sql
SELECT 
  -- Order Info
  o.id AS order_id,
  o.order_code,
  o.user_email,
  o.order_status,
  o.payment_status,
  o.total_amount,
  o.created_at,
  
  -- Task Info
  dt.id AS task_id,
  dt.course_url,
  dt.title AS course_title,
  dt.price AS course_price,
  dt.status AS task_status,
  dt.drive_link,
  dt.retry_count,
  dt.error_log,
  dt.created_at AS task_created,
  dt.updated_at AS task_updated

FROM orders o
LEFT JOIN download_tasks dt ON o.id = dt.order_id

-- ✅ CRITICAL: Specific paid order
WHERE o.id = :order_id 
  AND o.payment_status = 'paid'

ORDER BY dt.created_at ASC;
```

**Parameters:**
- `:order_id` - The order ID to fetch

**Expected Result:**

```json
[
  {
    "order_id": 123,
    "order_code": "DH123456",
    "user_email": "customer@example.com",
    "task_id": 1,
    "course_url": "https://udemy.com/react-course",
    "course_title": "React Complete Guide",
    "task_status": "completed",
    "drive_link": "https://drive.google.com/..."
  },
  {
    "order_id": 123,
    "order_code": "DH123456",
    "user_email": "customer@example.com",
    "task_id": 2,
    "course_url": "https://udemy.com/python-course",
    "course_title": "Python for Beginners",
    "task_status": "downloading",
    "drive_link": null
  }
]
```

---

## 📋 QUERY 3: GET AUDIT LOGS FOR ORDER

**Purpose:** Fetch all audit logs (persistent layer) for troubleshooting

```sql
SELECT 
  oal.id AS log_id,
  oal.order_id,
  oal.task_id,
  oal.event_type,
  oal.event_category,
  oal.severity,
  oal.message,
  oal.details,
  oal.previous_status,
  oal.new_status,
  oal.source,
  oal.created_at,
  
  -- Join task info
  dt.course_url,
  dt.title AS task_title

FROM order_audit_logs oal
LEFT JOIN download_tasks dt ON oal.task_id = dt.id

-- ✅ CRITICAL: Specific paid order
WHERE oal.order_id = :order_id
  AND oal.order_id IN (
    SELECT id FROM orders WHERE payment_status = 'paid'
  )

-- Newest first
ORDER BY oal.created_at DESC

-- Optional filters
-- AND oal.severity = :severity    -- e.g., 'error', 'critical'
-- AND oal.event_category = :category  -- e.g., 'download', 'enrollment'

LIMIT 100;
```

**Parameters:**
- `:order_id` - The order ID
- `:severity` (optional) - Filter by severity
- `:category` (optional) - Filter by category

**Expected Result:**

```json
[
  {
    "log_id": 456,
    "order_id": 123,
    "task_id": 1,
    "event_type": "download_completed",
    "event_category": "download",
    "severity": "info",
    "message": "Download completed: React Complete Guide",
    "details": {
      "folderName": "react-complete-guide",
      "driveLink": "https://drive.google.com/..."
    },
    "previous_status": "downloading",
    "new_status": "completed",
    "source": "python_worker",
    "created_at": "2026-01-14 11:30:00",
    "course_url": "https://udemy.com/react-course",
    "task_title": "React Complete Guide"
  }
]
```

---

## 📋 QUERY 4: GET ERROR SUMMARY

**Purpose:** Get all errors for a paid order (for admin alert)

```sql
SELECT 
  o.order_code,
  o.user_email,
  dt.id AS task_id,
  dt.course_url,
  dt.title AS course_title,
  
  -- Error Details
  oal.severity,
  oal.message,
  oal.event_type,
  oal.details->>'$.error_type' AS error_type,
  oal.details->>'$.error_message' AS error_message,
  oal.created_at AS error_time

FROM order_audit_logs oal
JOIN orders o ON oal.order_id = o.id
LEFT JOIN download_tasks dt ON oal.task_id = dt.id

-- ✅ CRITICAL: Only errors from paid orders
WHERE o.payment_status = 'paid'
  AND oal.severity IN ('error', 'critical')

-- Optional: Specific order
-- AND o.id = :order_id

ORDER BY oal.created_at DESC
LIMIT 50;
```

**Expected Result:**

```json
[
  {
    "order_code": "DH123456",
    "user_email": "customer@example.com",
    "task_id": 2,
    "course_url": "https://udemy.com/python-course",
    "course_title": "Python for Beginners",
    "severity": "error",
    "message": "Download failed after 3 retries",
    "event_type": "download_failed",
    "error_type": "DISK_SPACE",
    "error_message": "No space left on device",
    "error_time": "2026-01-14 11:45:00"
  }
]
```

---

## 📋 QUERY 5: DASHBOARD STATISTICS

**Purpose:** Get aggregate stats for the admin dashboard header

```sql
-- Orders Statistics
SELECT 
  COUNT(*) AS total_paid_orders,
  SUM(CASE WHEN order_status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
  SUM(CASE WHEN order_status = 'processing' THEN 1 ELSE 0 END) AS processing_count,
  SUM(CASE WHEN order_status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
  SUM(CASE WHEN order_status = 'failed' THEN 1 ELSE 0 END) AS failed_count
FROM orders
WHERE payment_status = 'paid';

-- Tasks Statistics (for paid orders only)
SELECT 
  dt.status,
  COUNT(*) AS count
FROM download_tasks dt
JOIN orders o ON dt.order_id = o.id
WHERE o.payment_status = 'paid'
GROUP BY dt.status;

-- Recent Errors (last 24 hours)
SELECT COUNT(*) AS error_count_24h
FROM order_audit_logs oal
JOIN orders o ON oal.order_id = o.id
WHERE o.payment_status = 'paid'
  AND oal.severity IN ('error', 'critical')
  AND oal.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR);
```

**Expected Result:**

```json
{
  "orders": {
    "total_paid_orders": 150,
    "pending_count": 5,
    "processing_count": 30,
    "completed_count": 110,
    "failed_count": 5
  },
  "tasks": {
    "pending": 10,
    "processing": 20,
    "enrolled": 15,
    "downloading": 10,
    "completed": 200,
    "failed": 5
  },
  "errors": {
    "error_count_24h": 3
  }
}
```

---

## 📋 QUERY 6: SEARCH PAID ORDERS

**Purpose:** Search orders by order code or email

```sql
SELECT 
  o.id,
  o.order_code,
  o.user_email,
  o.order_status,
  o.total_amount,
  o.created_at,
  COUNT(dt.id) AS total_tasks,
  SUM(CASE WHEN dt.status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks

FROM orders o
LEFT JOIN download_tasks dt ON o.id = dt.order_id

-- ✅ CRITICAL: Paid orders only + search filter
WHERE o.payment_status = 'paid'
  AND (
    o.order_code LIKE :search_term
    OR o.user_email LIKE :search_term
  )

GROUP BY o.id, o.order_code, o.user_email, o.order_status, o.total_amount, o.created_at

ORDER BY o.created_at DESC
LIMIT 20;
```

**Parameters:**
- `:search_term` - Search query (e.g., `%DH123%` or `%customer@example.com%`)

**Example Usage:**

```javascript
// Node.js (Sequelize)
const { Op } = require('sequelize');

const orders = await Order.findAll({
  where: {
    payment_status: 'paid',
    [Op.or]: [
      { order_code: { [Op.like]: `%${searchTerm}%` } },
      { user_email: { [Op.like]: `%${searchTerm}%` } }
    ]
  },
  include: [{ model: DownloadTask, as: 'tasks' }]
});
```

---

## 📋 QUERY 7: GET STUCK ORDERS (Monitoring Query)

**Purpose:** Find orders that have been processing for > 48 hours

```sql
SELECT 
  o.id,
  o.order_code,
  o.user_email,
  o.order_status,
  o.updated_at,
  TIMESTAMPDIFF(HOUR, o.updated_at, NOW()) AS hours_stuck,
  COUNT(dt.id) AS total_tasks,
  SUM(CASE WHEN dt.status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks

FROM orders o
LEFT JOIN download_tasks dt ON o.id = dt.order_id

-- ✅ CRITICAL: Paid + stuck in processing
WHERE o.payment_status = 'paid'
  AND o.order_status = 'processing'
  AND o.updated_at < DATE_SUB(NOW(), INTERVAL 48 HOUR)

GROUP BY o.id, o.order_code, o.user_email, o.order_status, o.updated_at

ORDER BY hours_stuck DESC;
```

**Expected Result:**

```json
[
  {
    "id": 123,
    "order_code": "DH123456",
    "user_email": "customer@example.com",
    "order_status": "processing",
    "updated_at": "2026-01-12 10:00:00",
    "hours_stuck": 50,
    "total_tasks": 3,
    "completed_tasks": 2
  }
]
```

**Use Case:** Run this query daily to alert admins about stuck orders.

---

## 🔧 SEQUELIZE (ORM) EQUIVALENTS

### Query 1: Get Paid Orders (Node.js)

```javascript
const { Order, DownloadTask } = require('./models');
const { fn, col, literal } = require('sequelize');

const orders = await Order.findAll({
  where: { payment_status: 'paid' },
  include: [{
    model: DownloadTask,
    as: 'tasks',
    attributes: ['id', 'status', 'course_url', 'title', 'drive_link']
  }],
  attributes: [
    'id',
    'order_code',
    'user_email',
    'order_status',
    'total_amount',
    'created_at',
    [fn('COUNT', col('tasks.id')), 'total_tasks'],
    [
      literal(`SUM(CASE WHEN tasks.status = 'completed' THEN 1 ELSE 0 END)`),
      'completed_tasks'
    ]
  ],
  group: ['Order.id'],
  order: [['created_at', 'DESC']],
  limit: 20,
  offset: 0
});
```

### Query 3: Get Audit Logs (Node.js)

```javascript
const { OrderAuditLog, Order, DownloadTask } = require('./models');

const auditLogs = await OrderAuditLog.findAll({
  where: { order_id: orderId },
  include: [
    {
      model: Order,
      as: 'order',
      where: { payment_status: 'paid' },
      attributes: ['order_code']
    },
    {
      model: DownloadTask,
      as: 'task',
      attributes: ['course_url', 'title']
    }
  ],
  order: [['created_at', 'DESC']],
  limit: 100
});
```

---

## 📊 PERFORMANCE OPTIMIZATION TIPS

### 1. Indexes (Already Created)

```sql
-- Essential indexes for fast queries
CREATE INDEX idx_payment_status ON orders(payment_status);
CREATE INDEX idx_order_id ON download_tasks(order_id);
CREATE INDEX idx_order_audit_order ON order_audit_logs(order_id);
CREATE INDEX idx_order_audit_severity ON order_audit_logs(severity);
```

### 2. Avoid N+1 Queries

```javascript
// ❌ BAD: N+1 queries
const orders = await Order.findAll({ where: { payment_status: 'paid' } });
for (const order of orders) {
  const tasks = await DownloadTask.findAll({ where: { order_id: order.id } });
}

// ✅ GOOD: Single query with JOIN
const orders = await Order.findAll({
  where: { payment_status: 'paid' },
  include: [{ model: DownloadTask, as: 'tasks' }]
});
```

### 3. Pagination

```javascript
// Always use pagination for large datasets
const page = 1;
const limit = 20;
const offset = (page - 1) * limit;

const { count, rows } = await Order.findAndCountAll({
  where: { payment_status: 'paid' },
  limit,
  offset,
  distinct: true  // Important for accurate count with JOINs
});
```

---

## ✅ QUICK REFERENCE CHECKLIST

- [ ] **Always filter by `payment_status='paid'`** in WHERE clause
- [ ] **Use indexes** for fast queries (already created in migration)
- [ ] **Paginate** results (default: 20 per page)
- [ ] **Use JOINs** efficiently (avoid N+1 queries)
- [ ] **Cache frequently accessed data** (Redis)
- [ ] **Monitor slow queries** (> 100ms)

---

## 📚 RELATED DOCUMENTATION

- **Full Implementation Guide:** `/docs/ADMIN_DASHBOARD_IMPLEMENTATION_GUIDE.md`
- **Architecture Summary:** `/HIERARCHICAL_MONITORING_ARCHITECTURE_SUMMARY.md`
- **Database Schema:** `/scripts/migrations/create_order_audit_logs.sql`

---

**Last Updated:** January 14, 2026  
**Author:** Senior System Architect  
**Status:** READY FOR USE ✅
