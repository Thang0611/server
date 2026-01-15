# 🎯 ADMIN DASHBOARD IMPLEMENTATION GUIDE

**System:** Hierarchical Logging & Monitoring for Paid Orders  
**Date:** January 14, 2026  
**Author:** Senior System Architect

---

## 📋 TABLE OF CONTENTS

1. [Architecture Overview](#architecture-overview)
2. [Database Setup](#database-setup)
3. [Backend Integration](#backend-integration)
4. [WebSocket Integration](#websocket-integration)
5. [Frontend Implementation](#frontend-implementation)
6. [Redis Channel Convention](#redis-channel-convention)
7. [Error Handling Strategy](#error-handling-strategy)
8. [Testing & Monitoring](#testing-monitoring)

---

## 1️⃣ ARCHITECTURE OVERVIEW

### Two-Layer Logging System

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: EPHEMERAL PROGRESS (Redis Pub/Sub + WebSocket)        │
│  Purpose: Real-time UI updates (% only)                         │
│  Storage: Redis (auto-expire 1 hour)                            │
│  Use Case: Admin sees download progress bar updating            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: PERSISTENT AUDIT LOGS (MySQL Database)                │
│  Purpose: System troubleshooting & compliance                   │
│  Storage: order_audit_logs table (permanent)                    │
│  Use Case: Admin clicks "Show Logs" to see full history         │
└─────────────────────────────────────────────────────────────────┘
```

### Hierarchical Data Structure

```
Order #DH123456 (payment_status='paid')
├── Order Details
│   ├── order_status: 'processing'
│   ├── total_amount: 300000
│   └── user_email: customer@example.com
│
├── Download Tasks (3)
│   ├── Task #1: React Course
│   │   ├── status: 'completed' ✅
│   │   ├── progress: 100%
│   │   └── drive_link: https://...
│   │
│   ├── Task #2: Python Course
│   │   ├── status: 'downloading' 🔄
│   │   ├── progress: 45%
│   │   └── current_file: "Lecture 5.mp4"
│   │
│   └── Task #3: DevOps Course
│       ├── status: 'enrolled' ⏳
│       └── progress: 0%
│
└── Audit Logs (15 events)
    ├── [2026-01-14 10:30] payment_received
    ├── [2026-01-14 10:31] task_created
    ├── [2026-01-14 10:35] enrollment_success
    └── ...
```

---

## 2️⃣ DATABASE SETUP

### Step 1: Run Migration

```bash
cd /root/server
mysql -u root -p udemy_system < scripts/migrations/create_order_audit_logs.sql
```

### Step 2: Verify Tables

```sql
-- Check table structure
DESCRIBE order_audit_logs;

-- Check indexes
SHOW INDEX FROM order_audit_logs;

-- Test view
SELECT * FROM v_order_latest_events LIMIT 5;
```

### Step 3: Update Sequelize Models

Edit `/root/server/src/models/index.js`:

```javascript
const Order = require('./order.model');
const DownloadTask = require('./downloadTask.model');
const OrderAuditLog = require('./orderAuditLog.model');

// Define associations
Order.hasMany(DownloadTask, {
  foreignKey: 'order_id',
  as: 'tasks'
});

Order.hasMany(OrderAuditLog, {
  foreignKey: 'order_id',
  as: 'auditLogs'
});

DownloadTask.belongsTo(Order, {
  foreignKey: 'order_id',
  as: 'order'
});

DownloadTask.hasMany(OrderAuditLog, {
  foreignKey: 'task_id',
  as: 'auditLogs'
});

OrderAuditLog.belongsTo(Order, {
  foreignKey: 'order_id',
  as: 'order'
});

OrderAuditLog.belongsTo(DownloadTask, {
  foreignKey: 'task_id',
  as: 'task'
});

module.exports = {
  sequelize,
  Order,
  DownloadTask,
  OrderAuditLog
};
```

---

## 3️⃣ BACKEND INTEGRATION

### Step 1: Install Dependencies

```bash
npm install socket.io
```

### Step 2: Modify `server.js`

```javascript
const express = require('express');
const http = require('http');
const { initializeWebSocket } = require('./src/websocket/progress.server');

const app = express();
const server = http.createServer(app);

// Initialize WebSocket server
const io = initializeWebSocket(server);

// Add admin routes
const adminRoutes = require('./src/routes/admin.routes');
app.use('/api/admin', adminRoutes);

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server initialized`);
});
```

### Step 3: Add Audit Logging to Existing Services

#### In `webhook.service.js` (add after task finalization):

```javascript
const auditService = require('./audit.service');

const finalizeDownload = async (taskId, folderName, secretKey) => {
  const task = await DownloadTask.findByPk(taskId);
  
  // Update task
  await task.update({
    status: 'completed',
    drive_link: `https://drive.google.com/drive/folders/${folderName}`
  });

  // ✅ LOG AUDIT EVENT
  await auditService.logDownload(
    task.order_id,
    taskId,
    'download_completed',
    `Download completed: ${folderName}`,
    { folderName, driveLink: task.drive_link },
    'info'
  );

  // Check batch completion...
  if (completedCount === totalCount) {
    // ✅ LOG BATCH COMPLETION
    await auditService.logEvent({
      orderId: order.id,
      eventType: 'order_completed',
      eventCategory: 'system',
      severity: 'info',
      message: `All ${totalCount} tasks completed`,
      details: { completedCount, totalCount },
      source: 'webhook_handler'
    });

    await emailService.sendBatchCompletionEmail(order, allTasks);
  }

  return { taskId, status: 'completed' };
};
```

#### In `payment.service.js` (add after payment verification):

```javascript
const auditService = require('./audit.service');

const handleWebhook = async (webhookData) => {
  // ... payment verification ...

  // ✅ LOG PAYMENT RECEIVED
  await auditService.logPayment(
    order.id,
    `Payment received: ${webhookData.transferAmount} VND`,
    {
      amount: webhookData.transferAmount,
      bank: webhookData.bankName,
      transactionId: webhookData.code
    }
  );

  // ... continue processing ...
};
```

---

## 4️⃣ WEBSOCKET INTEGRATION

### WebSocket Events Documentation

#### Client → Server Events

```javascript
// Subscribe to order progress
socket.emit('subscribe:order', { orderId: 123 });

// Subscribe to task progress
socket.emit('subscribe:task', { taskId: 456 });

// Unsubscribe
socket.emit('unsubscribe:order', { orderId: 123 });
socket.emit('unsubscribe:task', { taskId: 456 });
```

#### Server → Client Events

```javascript
// Progress update
socket.on('progress', (data) => {
  console.log(data);
  // {
  //   scope: 'task',
  //   id: 456,
  //   type: 'progress',
  //   data: {
  //     taskId: 456,
  //     percent: 45,
  //     currentFile: 'Lecture 5.mp4',
  //     speed: 1024000,
  //     timestamp: 1705234567890
  //   }
  // }
});

// Status change
socket.on('status', (data) => {
  console.log(data);
  // {
  //   scope: 'task',
  //   id: 456,
  //   type: 'status',
  //   data: {
  //     taskId: 456,
  //     newStatus: 'completed',
  //     previousStatus: 'downloading',
  //     timestamp: 1705234567890
  //   }
  // }
});

// Order complete
socket.on('complete', (data) => {
  console.log(data);
  // {
  //   scope: 'order',
  //   id: 123,
  //   type: 'complete',
  //   data: {
  //     orderId: 123,
  //     totalTasks: 3,
  //     completedTasks: 3,
  //     failedTasks: 0,
  //     timestamp: 1705234567890
  //   }
  // }
});
```

---

## 5️⃣ FRONTEND IMPLEMENTATION

### React Example (with Socket.IO Client)

```bash
npm install socket.io-client
```

#### AdminDashboard.jsx

```jsx
import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import OrderList from './OrderList';
import OrderDetails from './OrderDetails';

const AdminDashboard = () => {
  const [socket, setSocket] = useState(null);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [stats, setStats] = useState({});

  useEffect(() => {
    // Initialize WebSocket connection
    const socketInstance = io('http://localhost:3001', {
      path: '/socket.io',
      transports: ['websocket']
    });

    socketInstance.on('connect', () => {
      console.log('WebSocket connected');
    });

    socketInstance.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    setSocket(socketInstance);

    // Fetch initial data
    fetchOrders();
    fetchStats();

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await fetch('/api/admin/orders/paid?page=1&limit=20');
      const data = await response.json();
      setOrders(data.data);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/dashboard/stats');
      const data = await response.json();
      setStats(data.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleOrderSelect = (order) => {
    setSelectedOrder(order);
  };

  return (
    <div className="admin-dashboard">
      <div className="dashboard-header">
        <h1>Admin Dashboard - Paid Orders</h1>
        <div className="stats-cards">
          <div className="stat-card">
            <h3>Total Paid Orders</h3>
            <p>{stats.orders?.total || 0}</p>
          </div>
          <div className="stat-card">
            <h3>Processing</h3>
            <p>{stats.orders?.processing || 0}</p>
          </div>
          <div className="stat-card">
            <h3>Completed</h3>
            <p>{stats.orders?.completed || 0}</p>
          </div>
          <div className="stat-card">
            <h3>Failed</h3>
            <p>{stats.orders?.failed || 0}</p>
          </div>
        </div>
      </div>

      <div className="dashboard-content">
        <div className="orders-list">
          <OrderList
            orders={orders}
            socket={socket}
            onOrderSelect={handleOrderSelect}
          />
        </div>

        {selectedOrder && (
          <div className="order-details">
            <OrderDetails
              order={selectedOrder}
              socket={socket}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
```

#### OrderList.jsx

```jsx
import React, { useEffect, useState } from 'react';

const OrderList = ({ orders, socket, onOrderSelect }) => {
  const [ordersWithProgress, setOrdersWithProgress] = useState(orders);

  useEffect(() => {
    setOrdersWithProgress(orders);

    // Subscribe to all order progress updates
    if (socket && orders.length > 0) {
      orders.forEach(order => {
        socket.emit('subscribe:order', { orderId: order.id });
      });

      // Listen for progress updates
      socket.on('progress', (data) => {
        if (data.scope === 'order') {
          updateOrderProgress(data.id, data.data);
        }
      });

      socket.on('status', (data) => {
        if (data.scope === 'order') {
          updateOrderStatus(data.id, data.data);
        }
      });

      return () => {
        orders.forEach(order => {
          socket.emit('unsubscribe:order', { orderId: order.id });
        });
      };
    }
  }, [orders, socket]);

  const updateOrderProgress = (orderId, progressData) => {
    setOrdersWithProgress(prev =>
      prev.map(order =>
        order.id === orderId
          ? {
              ...order,
              currentProgress: progressData.percent,
              currentFile: progressData.currentFile
            }
          : order
      )
    );
  };

  const updateOrderStatus = (orderId, statusData) => {
    setOrdersWithProgress(prev =>
      prev.map(order =>
        order.id === orderId
          ? { ...order, order_status: statusData.newStatus }
          : order
      )
    );
  };

  return (
    <div className="order-list">
      <h2>Paid Orders</h2>
      {ordersWithProgress.map(order => (
        <div
          key={order.id}
          className="order-card"
          onClick={() => onOrderSelect(order)}
        >
          <div className="order-header">
            <h3>Order #{order.order_code}</h3>
            <span className={`status-badge ${order.order_status}`}>
              {order.order_status}
            </span>
          </div>
          
          <div className="order-info">
            <p>Email: {order.user_email}</p>
            <p>Tasks: {order.stats.completedTasks}/{order.stats.totalTasks}</p>
            <p>Progress: {order.stats.progressPercentage}%</p>
          </div>

          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${order.stats.progressPercentage}%` }}
            />
          </div>

          {order.currentFile && (
            <p className="current-file">📂 {order.currentFile}</p>
          )}
        </div>
      ))}
    </div>
  );
};

export default OrderList;
```

#### OrderDetails.jsx

```jsx
import React, { useEffect, useState } from 'react';

const OrderDetails = ({ order, socket }) => {
  const [tasks, setTasks] = useState(order.tasks || []);
  const [auditLogs, setAuditLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    // Subscribe to task progress for all tasks
    if (socket && tasks.length > 0) {
      tasks.forEach(task => {
        socket.emit('subscribe:task', { taskId: task.id });
      });

      socket.on('progress', (data) => {
        if (data.scope === 'task') {
          updateTaskProgress(data.id, data.data);
        }
      });

      socket.on('status', (data) => {
        if (data.scope === 'task') {
          updateTaskStatus(data.id, data.data);
        }
      });

      return () => {
        tasks.forEach(task => {
          socket.emit('unsubscribe:task', { taskId: task.id });
        });
      };
    }
  }, [tasks, socket]);

  const updateTaskProgress = (taskId, progressData) => {
    setTasks(prev =>
      prev.map(task =>
        task.id === taskId
          ? {
              ...task,
              currentProgress: progressData.percent,
              currentFile: progressData.currentFile,
              speed: progressData.speed
            }
          : task
      )
    );
  };

  const updateTaskStatus = (taskId, statusData) => {
    setTasks(prev =>
      prev.map(task =>
        task.id === taskId
          ? { ...task, status: statusData.newStatus }
          : task
      )
    );
  };

  const fetchAuditLogs = async () => {
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/logs`);
      const data = await response.json();
      setAuditLogs(data.data.logs);
      setShowLogs(true);
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    }
  };

  return (
    <div className="order-details">
      <h2>Order Details</h2>
      
      <div className="order-summary">
        <p><strong>Order Code:</strong> {order.order_code}</p>
        <p><strong>Email:</strong> {order.user_email}</p>
        <p><strong>Status:</strong> {order.order_status}</p>
        <p><strong>Total:</strong> {order.total_amount.toLocaleString()} VND</p>
      </div>

      <div className="tasks-section">
        <h3>Download Tasks</h3>
        {tasks.map(task => (
          <div key={task.id} className="task-card">
            <div className="task-header">
              <h4>{task.title || 'Untitled Course'}</h4>
              <span className={`status-badge ${task.status}`}>
                {task.status}
              </span>
            </div>

            <p className="task-url">{task.course_url}</p>

            <div className="task-progress">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${task.currentProgress || 0}%` }}
                />
              </div>
              <span className="progress-text">
                {task.currentProgress || 0}%
              </span>
            </div>

            {task.currentFile && (
              <p className="current-file">📂 {task.currentFile}</p>
            )}

            {task.speed && (
              <p className="download-speed">
                ⚡ {(task.speed / 1024 / 1024).toFixed(2)} MB/s
              </p>
            )}

            {task.drive_link && (
              <a
                href={task.drive_link}
                target="_blank"
                rel="noopener noreferrer"
                className="drive-link"
              >
                📂 Open in Google Drive
              </a>
            )}

            {task.error_log && (
              <div className="error-log">
                ⚠️ {task.error_log}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="audit-section">
        <button onClick={fetchAuditLogs} className="btn-show-logs">
          📋 Show Audit Logs
        </button>

        {showLogs && (
          <div className="audit-logs">
            <h3>System Audit Logs</h3>
            <div className="logs-list">
              {auditLogs.map(log => (
                <div key={log.id} className={`log-entry ${log.severity}`}>
                  <div className="log-header">
                    <span className="log-time">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                    <span className={`log-severity ${log.severity}`}>
                      {log.severity}
                    </span>
                    <span className="log-type">{log.event_type}</span>
                  </div>
                  <p className="log-message">{log.message}</p>
                  {log.details && (
                    <pre className="log-details">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderDetails;
```

---

## 6️⃣ REDIS CHANNEL CONVENTION

### Channel Naming Pattern

```
{scope}:{id}:{type}
```

**Scope:**
- `order` - Order-level events
- `task` - Task-level events

**Type:**
- `progress` - Progress updates (0-100%)
- `status` - Status changes
- `complete` - Completion events

### Examples

```
✅ CORRECT:
- order:123:progress     → Overall order progress
- task:456:progress      → Task #456 progress
- task:456:status        → Task #456 status change
- order:123:complete     → Order #123 completed

❌ INCORRECT:
- progress:task:456      → Wrong order
- task_456_progress      → Wrong delimiter
- order-123-progress     → Wrong delimiter
```

### Wildcard Subscriptions

```javascript
// Subscribe to all task progress events
socket.pSubscribe('task:*:progress');

// Subscribe to all order events
socket.pSubscribe('order:*:*');

// Subscribe to all status changes
socket.pSubscribe('*:*:status');
```

---

## 7️⃣ ERROR HANDLING STRATEGY

### Bridge from Ephemeral to Persistent

**Problem:** When a download fails at 0%, how do we ensure the error message is saved to the database?

**Solution:** Error Bridge Pattern

```python
# In worker_rq.py

def process_download(task_data):
    try:
        # ... download logic ...
        
        # ✅ EMIT EPHEMERAL: Live progress
        emit_progress(task_id, order_id, percent=45, current_file="Lecture5.mp4")
        
    except Exception as e:
        # ✅ CRITICAL: Bridge ephemeral error to persistent storage
        
        # 1. Emit ephemeral error (0% progress)
        emit_progress(task_id, order_id, percent=0, current_file=f"Failed: {str(e)}")
        emit_status_change(task_id, order_id, 'failed', 'downloading', str(e))
        
        # 2. Save to database (persistent)
        error_details = {
            'error_message': str(e),
            'error_type': determine_error_type(e),
            'timestamp': datetime.now().isoformat(),
            'stack_trace': traceback.format_exc()
        }
        
        update_task_error_log(task_id, error_details)
        
        # 3. Call Node.js audit service via webhook
        notify_error_to_node(task_id, order_id, error_details)
```

### Error Type Classification

```python
def determine_error_type(exception):
    """Classify error for better troubleshooting"""
    error_msg = str(exception).lower()
    
    if 'disk' in error_msg or 'space' in error_msg:
        return 'DISK_SPACE'
    elif 'authentication' in error_msg or 'token' in error_msg:
        return 'AUTHENTICATION'
    elif 'timeout' in error_msg:
        return 'TIMEOUT'
    elif 'network' in error_msg or 'connection' in error_msg:
        return 'NETWORK'
    elif 'permission' in error_msg:
        return 'PERMISSION'
    else:
        return 'UNKNOWN'
```

### Node.js Error Handler

```javascript
// In webhook.service.js

const handlePythonError = async (taskId, orderId, errorDetails) => {
  // Log to audit table
  await auditService.logError(
    orderId,
    taskId,
    errorDetails.error_message,
    errorDetails,
    'python_worker'
  );

  // Send alert email to admin
  if (errorDetails.error_type === 'DISK_SPACE' || errorDetails.error_type === 'AUTHENTICATION') {
    await emailService.sendErrorAlert(
      { id: taskId, order_id: orderId },
      errorDetails.error_message
    );
  }
};
```

---

## 8️⃣ TESTING & MONITORING

### Manual Testing Checklist

#### Test 1: Progress Tracking

```bash
# 1. Create a test order with 1 task
curl -X POST http://localhost:3001/api/payment/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "code": "DH123456",
    "transferAmount": 300000
  }'

# 2. Open admin dashboard and subscribe to order
# 3. Verify progress updates from 0% → 100%
```

#### Test 2: Audit Logs

```bash
# 1. Trigger a failed download (invalid URL)
# 2. Check audit logs via API
curl http://localhost:3001/api/admin/orders/123/logs?severity=error

# 3. Verify error is in database
mysql -u root -p -e "SELECT * FROM order_audit_logs WHERE task_id = 456 AND severity = 'error';"
```

#### Test 3: Batch Completion

```bash
# 1. Create order with 3 tasks
# 2. Wait for all to complete
# 3. Verify:
#    - order_status changed to 'completed'
#    - Single batch email sent (not 3 separate emails)
#    - Audit log has 'order_completed' event
```

### Monitoring Commands

```bash
# Check Redis channels
redis-cli
> PUBSUB CHANNELS
> PUBSUB NUMSUB task:456:progress

# Check WebSocket connections
curl http://localhost:3001/api/admin/dashboard/stats

# Check audit logs count
mysql -u root -p -e "SELECT event_category, COUNT(*) FROM order_audit_logs GROUP BY event_category;"
```

### Performance Metrics

Monitor these metrics in production:

- **Redis Pub/Sub Latency:** Should be < 10ms
- **WebSocket Connection Count:** Monitor for leaks
- **Audit Log Table Size:** Should grow linearly with orders
- **Progress Update Frequency:** ~1 update per 5 seconds (not flooding)

---

## 📝 SQL QUERIES FOR ADMIN DASHBOARD

### Query 1: Get Paid Orders with Hierarchical Data

```sql
-- This is what the API endpoint does internally
SELECT 
  o.id,
  o.order_code,
  o.user_email,
  o.order_status,
  o.payment_status,
  o.total_amount,
  o.created_at,
  COUNT(dt.id) AS total_tasks,
  SUM(CASE WHEN dt.status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks,
  SUM(CASE WHEN dt.status = 'failed' THEN 1 ELSE 0 END) AS failed_tasks,
  ROUND((SUM(CASE WHEN dt.status = 'completed' THEN 1 ELSE 0 END) / COUNT(dt.id)) * 100) AS progress_percentage
FROM orders o
LEFT JOIN download_tasks dt ON o.id = dt.order_id
WHERE o.payment_status = 'paid'
GROUP BY o.id
ORDER BY o.created_at DESC
LIMIT 20;
```

### Query 2: Get Audit Logs for an Order

```sql
SELECT 
  oal.id,
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
  dt.course_url,
  dt.title AS task_title
FROM order_audit_logs oal
LEFT JOIN download_tasks dt ON oal.task_id = dt.id
WHERE oal.order_id = 123
ORDER BY oal.created_at DESC
LIMIT 100;
```

### Query 3: Error Summary

```sql
SELECT 
  o.order_code,
  dt.id AS task_id,
  dt.course_url,
  oal.severity,
  oal.message,
  oal.details->>'$.error_type' AS error_type,
  oal.created_at
FROM order_audit_logs oal
JOIN orders o ON oal.order_id = o.id
LEFT JOIN download_tasks dt ON oal.task_id = dt.id
WHERE o.payment_status = 'paid'
  AND oal.severity IN ('error', 'critical')
ORDER BY oal.created_at DESC
LIMIT 50;
```

---

## 🚀 DEPLOYMENT CHECKLIST

- [ ] **Database:**
  - [ ] Run migration script
  - [ ] Verify indexes created
  - [ ] Test stored procedures
  - [ ] Backup database

- [ ] **Backend:**
  - [ ] Install `socket.io` dependency
  - [ ] Add admin routes to `server.js`
  - [ ] Update `models/index.js` associations
  - [ ] Configure CORS for WebSocket
  - [ ] Set environment variables

- [ ] **Python Worker:**
  - [ ] Install `redis` package: `pip install redis`
  - [ ] Copy `progress_emitter.py` to `udemy_dl/`
  - [ ] Update `worker_rq.py` with progress tracking
  - [ ] Test Redis connection
  - [ ] Restart PM2 workers

- [ ] **Redis:**
  - [ ] Verify Redis is running
  - [ ] Check connection from Node.js
  - [ ] Check connection from Python
  - [ ] Monitor memory usage

- [ ] **Frontend:**
  - [ ] Install `socket.io-client`
  - [ ] Implement dashboard components
  - [ ] Test WebSocket connection
  - [ ] Test error handling

- [ ] **Testing:**
  - [ ] Test progress updates
  - [ ] Test audit logs
  - [ ] Test batch completion
  - [ ] Test error handling
  - [ ] Load test with 10 concurrent orders

- [ ] **Monitoring:**
  - [ ] Set up Redis monitoring
  - [ ] Monitor WebSocket connections
  - [ ] Monitor audit log table size
  - [ ] Set up error alerting

---

## 📚 ADDITIONAL RESOURCES

- **Socket.IO Documentation:** https://socket.io/docs/v4/
- **Redis Pub/Sub:** https://redis.io/docs/manual/pubsub/
- **Sequelize Associations:** https://sequelize.org/docs/v6/core-concepts/assocs/

---

## ✅ SUMMARY

This implementation provides:

1. **✅ Scope Filter:** Only displays orders where `payment_status='paid'`
2. **✅ Hierarchical View:** Order → Tasks → Task Details
3. **✅ Ephemeral Progress:** Redis Pub/Sub + WebSocket (% only, no DB spam)
4. **✅ Persistent Audit:** MySQL table with full event history
5. **✅ Redis Convention:** `{scope}:{id}:{type}` format
6. **✅ Error Bridge:** Ephemeral errors saved to persistent storage
7. **✅ Real-time UI:** WebSocket updates without page refresh

**Next Steps:**
1. Run database migration
2. Integrate admin routes
3. Test with sample order
4. Deploy to production

🎉 **Ready for Production!**
