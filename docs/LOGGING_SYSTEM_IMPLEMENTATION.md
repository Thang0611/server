# 📋 Logging System Implementation Guide

## Overview

This document describes the comprehensive logging system implemented for tracking orders from creation to final delivery.

## Architecture

The logging system is split into two distinct strategies:

### 1. **Lifecycle Logger (Centralized)**
- **Purpose**: Track critical business events
- **Storage**: `logs/lifecycle-YYYY-MM-DD.log` (rotated daily)
- **Technology**: Winston with daily rotation
- **Events**: Order, Payment, Enrollment, Download, Upload, Email, Permission Grant

### 2. **Task Logger (Per Task)**
- **Purpose**: Track detailed download progress for individual tasks
- **Storage**: `logs/tasks/task-{taskId}.log` (temporary files)
- **Technology**: File-based logging with progress parsing
- **Use Case**: Real-time progress tracking (0% → 100%)

---

## Lifecycle Events

### Order Creation
**Format**: `[ORDER_CREATED] [OrderId: {id}] [Email: {email}] [Total: {price}] [Status: {paymentStatus}] [GetInfo: {successCount}/{totalCount} Success, Failed: {urls}]`

**Location**: `src/services/payment.service.js` → `createOrder()`

**Example**:
```
[2026-01-14 10:30:15] [INFO] [ORDER_CREATED] [OrderId: 123] [Email: user@example.com] [Total: 50000] [Status: pending] [GetInfo: 5/5 Success]
```

### Enrollment
**Success Format**: `[ENROLL_SUCCESS] [OrderId: {id}] [TaskId: {taskId}] [Email: {email}]`

**Error Format**: `[ENROLL_ERROR] [TaskId: {id}] [Reason: {error}]`

**Location**: 
- `src/services/payment.service.js` → `processPaymentWebhook()`
- `src/services/enroll.service.js` → `enrollCourses()`

### Download
**Success Format**: `[DOWNLOAD_SUCCESS] [TaskId: {id}] [Duration: {time}s]`

**Error Format**: `[DOWNLOAD_ERROR] [TaskId: {id}] [Reason: {error}]`

**Location**: 
- `udemy_dl/worker_rq.py` → `process_download()`
- Python worker sends events via HTTP API to Node.js backend

### Upload
**Success Format**: `[UPLOAD_SUCCESS] [TaskId: {id}] [DriveLink: {url}]`

**Error Format**: `[UPLOAD_ERROR] [TaskId: {id}] [Reason: {error}]`

**Location**: 
- `udemy_dl/worker_rq.py` → `process_download()` (upload step)
- `src/services/webhook.service.js` → `finalizeDownload()`

### Email Notification
**Success Format**: `[EMAIL_SENT] [OrderId: {id}] [To: {email}] [Type: {emailType}]`

**Error Format**: `[EMAIL_ERROR] [OrderId: {id}] [Reason: {error}]`

**Location**: `src/services/email.service.js` → `sendBatchCompletionEmail()`

### Permission Granting
**Success Format**: `[PERMISSION_GRANTED] [TaskId: {id}] [User: {email}]`

**Error Format**: `[PERMISSION_ERROR] [TaskId: {id}] [Reason: {error}]`

**Location**: `src/services/grantAccess.service.js` → `grantAccess()`

---

## Task Logger (Per-Task Progress)

### File Structure
- **Directory**: `logs/tasks/`
- **Filename**: `task-{taskId}.log`
- **Format**: `[TIMESTAMP] [LEVEL] MESSAGE`

### Progress Parsing
The TaskLogger can parse progress percentages from log lines:
- Supports formats: `15%`, `Downloading: 50%`, `[45%]`
- Returns latest progress (0-100) for real-time monitoring

### API Methods

```javascript
const taskLogger = require('./services/taskLogger.service');

// Write log entry
taskLogger.writeTaskLog(taskId, 'Downloading lecture 5...', 'INFO');

// Read log (last 100 lines)
const logContent = taskLogger.readTaskLog(taskId, 100);

// Get latest progress percentage
const progress = taskLogger.getLatestProgress(taskId); // Returns 0-100 or null

// Delete log after completion
taskLogger.deleteTaskLog(taskId);

// Cleanup old logs (older than 7 days)
taskLogger.cleanupOldLogs(7);
```

---

## Python Worker Integration

The Python worker uses `lifecycle_logger.py` to send events to Node.js backend:

```python
from lifecycle_logger import log_download_success, log_download_error, log_upload_success, log_upload_error

# Log download success
log_download_success(task_id, duration, {'orderId': order_id, 'folderName': folder_name})

# Log download error
log_download_error(task_id, error_message, {'orderId': order_id, 'retriesAttempted': 3})

# Log upload success
log_upload_success(task_id, drive_link, {'orderId': order_id})

# Log upload error
log_upload_error(task_id, error_message, {'orderId': order_id})
```

**Backend Endpoint**: `POST /api/v1/internal/lifecycle-log`

---

## Integration Points

### 1. Order Creation
**File**: `src/services/payment.service.js`
- Logs order creation with validation details
- Includes GetInfo success/failure counts

### 2. Payment Processing
**File**: `src/services/payment.service.js`
- Logs payment received event
- Includes amount and payment method

### 3. Enrollment
**Files**: 
- `src/services/payment.service.js` (during payment webhook)
- `src/services/enroll.service.js` (standalone enrollment)

### 4. Download/Upload
**Files**:
- `udemy_dl/worker_rq.py` (Python worker)
- `src/services/webhook.service.js` (Node.js webhook handler)

### 5. Email
**File**: `src/services/email.service.js`
- Logs batch completion emails

### 6. Permission Grant
**File**: `src/services/grantAccess.service.js`
- Logs permission granted/error for each course

---

## Log File Management

### Lifecycle Logs
- **Rotation**: Daily (new file each day)
- **Retention**: 30 days
- **Max Size**: 20MB per file
- **Compression**: Enabled (old files are zipped)

### Task Logs
- **Retention**: 7 days (configurable)
- **Cleanup**: Automatic via `cleanupOldLogs()`
- **Location**: `logs/tasks/task-{taskId}.log`

---

## Monitoring & Admin Dashboard

### Real-time Progress
- Task logs are parsed for progress percentages
- Progress is emitted via Redis Pub/Sub → WebSocket
- Admin dashboard can display progress bars

### Historical Logs
- Lifecycle logs provide complete audit trail
- Searchable by orderId, taskId, event type
- Error logs are separated into `lifecycle-error-*.log`

---

## Usage Examples

### Log Order Creation
```javascript
const lifecycleLogger = require('./services/lifecycleLogger.service');

lifecycleLogger.logOrderCreated(
  orderId,
  email,
  totalAmount,
  'pending',
  {
    successCount: 5,
    totalCount: 5,
    failedUrls: []
  }
);
```

### Log Download Progress (Task Logger)
```javascript
const taskLogger = require('./services/taskLogger.service');

// Worker writes progress to task log
taskLogger.writeTaskLog(taskId, 'Downloading: 45%', 'INFO');

// Admin reads progress
const progress = taskLogger.getLatestProgress(taskId); // Returns 45
```

---

## Configuration

### Environment Variables
- `LOG_LEVEL`: Log level (default: 'info')
- `BACKEND_URL`: Backend URL for Python worker (default: 'http://localhost:3000')

### Winston Configuration
- **Daily Rotation**: Enabled
- **Max Files**: 30 days
- **Max Size**: 20MB per file
- **Compression**: Enabled

---

## Troubleshooting

### Lifecycle logs not appearing
1. Check `logs/` directory exists and is writable
2. Verify Winston is installed: `npm install winston winston-daily-rotate-file`
3. Check log level: `LOG_LEVEL=debug` for verbose logging

### Python worker can't send logs
1. Verify `BACKEND_URL` environment variable is set
2. Check backend is running and `/api/v1/internal/lifecycle-log` endpoint is accessible
3. Check Python `requests` library is installed

### Task logs not parsing progress
1. Verify log format includes percentage (e.g., "45%")
2. Check `parseProgressFromLine()` regex patterns
3. Ensure task log file exists and is readable

---

## Future Enhancements

1. **Database Logging**: Store lifecycle logs in MySQL for advanced querying
2. **Log Aggregation**: Use ELK stack or similar for centralized log management
3. **Alerting**: Integrate with monitoring systems (e.g., Sentry, Datadog)
4. **Analytics**: Build dashboards for order completion rates, error patterns

---

## Files Created/Modified

### New Files
- `src/services/lifecycleLogger.service.js` - Centralized lifecycle logging
- `src/services/taskLogger.service.js` - Per-task progress logging
- `udemy_dl/lifecycle_logger.py` - Python lifecycle logger
- `src/routes/internal.routes.js` - Internal API for Python worker
- `docs/LOGGING_SYSTEM_IMPLEMENTATION.md` - This documentation

### Modified Files
- `src/services/payment.service.js` - Added order creation & payment logging
- `src/services/enroll.service.js` - Added enrollment logging
- `src/services/email.service.js` - Added email logging
- `src/services/grantAccess.service.js` - Added permission logging
- `src/services/webhook.service.js` - Added upload logging
- `udemy_dl/worker_rq.py` - Added download/upload logging
- `server.js` - Added internal routes
- `package.json` - Added Winston dependencies

---

## Summary

The logging system provides:
✅ **Complete audit trail** from order creation to delivery
✅ **Real-time progress tracking** for admin monitoring
✅ **Structured logging** with consistent formats
✅ **Automatic log rotation** and cleanup
✅ **Error tracking** with detailed context
✅ **Inter-service communication** (Python → Node.js)

All critical business events are now logged and can be monitored in real-time or reviewed historically.
