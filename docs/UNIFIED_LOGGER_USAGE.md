# Unified Logger Service - Usage Guide

## Overview

The Unified Logger Service provides a centralized, structured logging system that:
- Stores logs in database (`task_logs` and `order_audit_logs` tables)
- Writes to files (with rotation)
- Outputs to console (development only)
- Uses consistent JSON format
- Handles race conditions safely

## Installation

1. **Run the migration:**
```bash
mysql -u your_user -p your_database < server/scripts/migrations/create_task_logs.sql
```

2. **Import the service:**
```javascript
const UnifiedLogger = require('./services/unifiedLogger.service');
```

## Basic Usage

### Log Order Event

```javascript
await UnifiedLogger.logOrderEvent(
  orderId,           // number
  'payment',         // category: 'order', 'payment', 'notification'
  'Payment received', // message
  { amount: 50000 },  // details (optional)
  'info',            // level (optional, default: 'info')
  'webhook_handler'  // source (optional, default: 'node_worker')
);
```

### Log Task Event

```javascript
await UnifiedLogger.logTaskEvent(
  taskId,            // number
  orderId,           // number
  'download',        // category: 'enrollment', 'download', 'upload'
  'Download started', // message
  { courseUrl: '...' }, // details (optional)
  'info',            // level (optional)
  'python_worker'     // source (optional)
);
```

### Log Download Progress

```javascript
await UnifiedLogger.logProgress(
  taskId,            // number
  orderId,           // number
  45.5,              // progress percentage (0-100)
  'lecture-9.mp4',   // current file (optional)
  {                 // additional details (optional)
    speed: 2500000,  // bytes/sec
    eta: '5m 30s'
  }
);
```

### Log Error

```javascript
try {
  // ... some code ...
} catch (error) {
  await UnifiedLogger.logError(
    orderId,          // optional
    taskId,           // optional
    error,            // Error object
    'Failed to process download', // message
    {                 // context (optional)
      courseUrl: '...',
      retryCount: 3
    },
    'python_worker'   // source (optional)
  );
}
```

### Generic Log

```javascript
await UnifiedLogger.log({
  orderId: 123,
  taskId: 456,
  level: 'info',
  category: 'download',
  source: 'python_worker',
  message: 'Download completed',
  details: {
    duration: 1200,
    fileCount: 50
  },
  progress: 100,
  currentFile: null
});
```

## Categories

- **`order`** - Order-level events (creation, completion)
- **`payment`** - Payment events (received, verified)
- **`enrollment`** - Enrollment events (started, success, failed)
- **`download`** - Download events (started, progress, completed, failed)
- **`upload`** - Upload events (started, completed, failed)
- **`notification`** - Email/notification events
- **`system`** - System-level events

## Log Levels

- **`debug`** - Debug messages (only in development)
- **`info`** - Informational messages
- **`warn`** - Warning messages
- **`error`** - Error messages
- **`critical`** - Critical errors

## Storage

### Database Storage

- **Task logs** → `task_logs` table (for download/upload/enrollment events)
- **Audit logs** → `order_audit_logs` table (for payment/order/notification events)

### File Storage

- **Task logs** → `logs/tasks/task-{taskId}.log` (JSON format, one per task)
- **App logs** → `logs/app-YYYY-MM-DD.log` (JSON format, daily rotation)

### Console Output

- Only in development mode (`NODE_ENV=development`)
- Colored output using existing `Logger` utility

## Python Worker Integration

Python workers can send logs via HTTP API:

```python
import requests
import os

def log_to_node_api(task_id, order_id, level, message, details=None, progress=None, current_file=None):
    """Send log to Node.js API for database storage"""
    api_url = os.getenv('NODE_API_URL', 'http://localhost:3000')
    payload = {
        'orderId': order_id,
        'level': level,
        'category': 'download',
        'message': message,
        'details': details or {},
        'progress': progress,
        'currentFile': current_file,
        'source': 'python_worker'
    }
    try:
        response = requests.post(
            f'{api_url}/api/v1/internal/tasks/{task_id}/logs',
            json=payload,
            timeout=2
        )
        return response.json()
    except Exception as e:
        # Don't break download if logging fails
        print(f"[WARN] Failed to send log to API: {e}")
        return None

# Usage in Python worker:
log_to_node_api(
    task_id=456,
    order_id=123,
    level='info',
    message='Downloading lecture 5/20',
    progress=25.0,
    current_file='lecture-5.mp4',
    details={'speed': 2500000, 'eta': '5m 30s'}
)
```

## Querying Logs

### Get Task Logs

```javascript
const TaskLog = require('./models/taskLog.model');

// Get all logs for a task
const logs = await TaskLog.findAll({
  where: { task_id: taskId },
  order: [['created_at', 'DESC']],
  limit: 100
});

// Get logs by level
const errors = await TaskLog.findAll({
  where: { 
    task_id: taskId,
    level: 'error'
  }
});

// Get latest progress
const latestProgress = await TaskLog.findOne({
  where: { 
    task_id: taskId,
    progress_percent: { [Op.not]: null }
  },
  order: [['created_at', 'DESC']]
});
```

### Get Order Logs (Unified)

```javascript
const { TaskLog, OrderAuditLog } = require('./models');

// Get all logs for an order (both task logs and audit logs)
const [taskLogs, auditLogs] = await Promise.all([
  TaskLog.findAll({
    where: { order_id: orderId },
    order: [['created_at', 'DESC']]
  }),
  OrderAuditLog.findAll({
    where: { order_id: orderId },
    order: [['created_at', 'DESC']]
  })
]);

// Combine and sort by timestamp
const allLogs = [...taskLogs, ...auditLogs].sort((a, b) => 
  new Date(b.created_at) - new Date(a.created_at)
);
```

## Migration from Old System

### Before (Old System)

```javascript
// Multiple different loggers
Logger.info('Order created', { orderId: 123 });
lifecycleLogger.logOrderCreated(123, 'user@example.com', 50000, 'paid');
auditService.logEvent({ orderId: 123, eventType: 'order_created', ... });
taskLogger.writeTaskLog(taskId, 'Download started', 'INFO');
```

### After (Unified System)

```javascript
// Single unified logger
await UnifiedLogger.logOrderEvent(123, 'order', 'Order created', {
  email: 'user@example.com',
  totalAmount: 50000,
  paymentStatus: 'paid'
});

await UnifiedLogger.logTaskEvent(taskId, orderId, 'download', 'Download started');
```

## Benefits

1. **No Race Conditions** - Database handles concurrency
2. **Structured Format** - Consistent JSON, easy to parse
3. **Queryable** - Database queries vs file parsing
4. **Unified API** - One service for all logging
5. **Task Correlation** - Python logs linked to tasks
6. **Error Stacks** - Full stack traces captured
7. **Admin Dashboard Ready** - Structured data for visualization

## Best Practices

1. **Always include orderId and taskId** when available for correlation
2. **Use appropriate categories** for better filtering
3. **Include context in details** for debugging
4. **Log progress updates** at significant milestones (every 10% or major file)
5. **Don't break main flow** - logging failures are caught and ignored
6. **Use error level** for actual errors, not warnings

## API Endpoints

### Internal API (for Python workers)

- **POST** `/api/v1/internal/tasks/:taskId/logs`
  - Body: `{ orderId, level, category, message, details, progress, currentFile, source }`
  - Returns: `{ success: true, data: { logId } }`

### Admin API (for dashboard)

- **GET** `/api/admin/orders/:id/logs` (enhanced to include task logs)
- **GET** `/api/admin/tasks/:id/logs` (new endpoint for task logs)

---

**See `LOGGING_SYSTEM_AUDIT_AND_REFACTORING_PLAN.md` for full architecture details.**
