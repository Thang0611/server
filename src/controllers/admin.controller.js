/**
 * Admin Controller - Dashboard for monitoring paid orders
 * @module controllers/admin
 */

const { Order, DownloadTask, OrderAuditLog, TaskLog } = require('../models');
const auditService = require('../services/audit.service');
const { asyncHandler } = require('../middleware/errorHandler.middleware');
const { AppError } = require('../middleware/errorHandler.middleware');
const Logger = require('../utils/logger.util');
const { Op } = require('sequelize');

/**
 * Get all paid orders with their tasks (Hierarchical View)
 * SCOPE FILTER: Only orders where payment_status = 'paid'
 * 
 * @route GET /api/admin/orders/paid
 * @access Admin only
 */
const getPaidOrders = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    order_status,
    search
  } = req.query;

  // Build where clause - CRITICAL: Only paid orders
  const where = {
    payment_status: 'paid'
  };

  // Optional filter by order_status
  // FIX: When order_status='paid' (from frontend), don't filter by order_status
  // because 'paid' refers to payment_status, not order_status
  // Only filter by order_status when it's a specific fulfillment status
  if (order_status && order_status !== 'paid') {
    where.order_status = order_status;
  }

  // Optional search by order_code or email
  if (search) {
    where[Op.or] = [
      { order_code: { [Op.like]: `%${search}%` } },
      { user_email: { [Op.like]: `%${search}%` } }
    ];
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);

  // Fetch orders with hierarchical data
  const { count, rows: orders } = await Order.findAndCountAll({
    where,
    include: [
      {
        model: DownloadTask,
        as: 'tasks',
        attributes: [
          'id',
          'course_url',
          'title',
          'status',
          'drive_link',
          'retry_count',
          'error_log',
          'created_at',
          'updated_at'
        ]
      }
    ],
    attributes: [
      'id',
      'order_code',
      'user_email',
      'total_amount',
      'payment_status',
      'order_status',
      'created_at',
      'updated_at'
    ],
    order: [['created_at', 'DESC']],
    limit: parseInt(limit),
    offset,
    distinct: true
  });

  // Calculate statistics for each order
  const ordersWithStats = orders.map(order => {
    const tasks = order.tasks || [];
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const failedTasks = tasks.filter(t => t.status === 'failed').length;
    const processingTasks = tasks.filter(t => 
      ['processing', 'enrolled', 'pending'].includes(t.status)
    ).length;

    // Calculate overall progress percentage
    const progressPercentage = totalTasks > 0 
      ? Math.round((completedTasks / totalTasks) * 100)
      : 0;

    return {
      ...order.toJSON(),
      stats: {
        totalTasks,
        completedTasks,
        failedTasks,
        processingTasks,
        progressPercentage
      }
    };
  });

  res.json({
    success: true,
    data: ordersWithStats,
    pagination: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / parseInt(limit))
    }
  });
});

/**
 * Get detailed order with tasks and audit logs
 * 
 * @route GET /api/admin/orders/:id
 * @access Admin only
 */
const getOrderDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await Order.findOne({
    where: { 
      id,
      payment_status: 'paid' // CRITICAL: Only paid orders
    },
    include: [
      {
        model: DownloadTask,
        as: 'tasks',
        attributes: [
          'id',
          'course_url',
          'title',
          'price',
          'status',
          'drive_link',
          'retry_count',
          'error_log',
          'created_at',
          'updated_at'
        ]
      }
    ]
  });

  if (!order) {
    throw new AppError('Order not found or not paid', 404);
  }

  // Get audit logs for this order
  const auditLogs = await auditService.getOrderLogs(id);
  const errorSummary = await auditService.getOrderErrorSummary(id);

  res.json({
    success: true,
    data: {
      order: order.toJSON(),
      auditLogs,
      errorSummary
    }
  });
});

/**
 * Get unified logs for a specific order (audit logs + task logs)
 * 
 * @route GET /api/admin/orders/:id/logs
 * @access Admin only
 * @query severity, category, source, limit
 */
const getOrderAuditLogs = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { severity, category, source, limit = 100 } = req.query;

  // Verify order exists and is paid
  const order = await Order.findOne({
    where: { 
      id,
      payment_status: 'paid'
    },
    attributes: ['id', 'order_code']
  });

  if (!order) {
    throw new AppError('Order not found or not paid', 404);
  }

  // Build where clauses
  const auditWhere = { order_id: id };
  const taskWhere = { order_id: id };

  if (severity) {
    auditWhere.severity = severity;
    // Map severity to level for task logs
    taskWhere.level = severity === 'warning' ? 'warn' : severity;
  }

  if (category) {
    auditWhere.event_category = category;
    taskWhere.category = category;
  }

  if (source) {
    auditWhere.source = source;
    taskWhere.source = source;
  }

  // Fetch both audit logs and task logs in parallel
  const [auditLogs, taskLogs] = await Promise.all([
    OrderAuditLog.findAll({
      where: auditWhere,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      attributes: [
        'id',
        'task_id',
        'event_type',
        'event_category',
        'severity',
        'message',
        'details',
        'previous_status',
        'new_status',
        'source',
        'created_at'
      ]
    }),
    TaskLog.findAll({
      where: taskWhere,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      attributes: [
        'id',
        'task_id',
        'level',
        'category',
        'message',
        'details',
        'progress_percent',
        'current_file',
        'source',
        'created_at'
      ]
    })
  ]);

  // Transform to unified format
  const unifiedLogs = [
    // Transform audit logs
    ...auditLogs.map(log => {
      // Ensure timestamp is in ISO string format
      const timestamp = log.created_at instanceof Date 
        ? log.created_at.toISOString() 
        : (log.created_at ? new Date(log.created_at).toISOString() : new Date().toISOString());
      
      return {
        id: log.id,
        type: 'audit',
        timestamp: timestamp,
        level: log.severity,
        category: log.event_category,
        source: log.source,
        taskId: log.task_id,
        orderId: id,
        message: log.message,
        details: log.details,
        progress: null,
        currentFile: null,
        eventType: log.event_type,
        previousStatus: log.previous_status,
        newStatus: log.new_status
      };
    }),
    // Transform task logs
    ...taskLogs.map(log => {
      // Ensure timestamp is in ISO string format
      const timestamp = log.created_at instanceof Date 
        ? log.created_at.toISOString() 
        : (log.created_at ? new Date(log.created_at).toISOString() : new Date().toISOString());
      
      return {
        id: log.id,
        type: 'task',
        timestamp: timestamp,
        level: log.level,
        category: log.category,
        source: log.source,
        taskId: log.task_id,
        orderId: id,
        message: log.message,
        details: log.details,
        progress: log.progress_percent ? parseFloat(log.progress_percent) : null,
        currentFile: log.current_file,
        eventType: null,
        previousStatus: null,
        newStatus: null
      };
    })
  ].sort((a, b) => {
    // Sort by timestamp (newest first) - ensure proper date comparison
    try {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      
      // Handle invalid dates
      if (isNaN(dateA) || isNaN(dateB)) {
        // If either date is invalid, put invalid dates at the end
        if (isNaN(dateA) && isNaN(dateB)) return 0;
        if (isNaN(dateA)) return 1;
        if (isNaN(dateB)) return -1;
      }
      
      return dateB - dateA; // Descending order (newest first)
    } catch (error) {
      // If date parsing fails, maintain original order
      return 0;
    }
  })
   .slice(0, parseInt(limit)); // Final limit after merge

  // Calculate summary
  const summary = {
    total: unifiedLogs.length,
    errors: unifiedLogs.filter(l => l.level === 'error' || l.level === 'critical').length,
    warnings: unifiedLogs.filter(l => l.level === 'warn' || l.level === 'warning').length,
    info: unifiedLogs.filter(l => l.level === 'info').length,
    byCategory: {},
    bySource: {}
  };

  unifiedLogs.forEach(log => {
    summary.byCategory[log.category] = (summary.byCategory[log.category] || 0) + 1;
    summary.bySource[log.source] = (summary.bySource[log.source] || 0) + 1;
  });

  res.json({
    success: true,
    data: {
      orderId: id,
      orderCode: order.order_code,
      logs: unifiedLogs,
      total: unifiedLogs.length,
      summary
    }
  });
});

/**
 * Get logs for a specific task
 * 
 * @route GET /api/admin/tasks/:id/logs
 * @access Admin only
 * @query level, category, source, limit
 */
const getTaskLogs = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { level, category, source, limit = 200 } = req.query;

  // Verify task exists
  const task = await DownloadTask.findOne({
    where: { id },
    attributes: ['id', 'order_id', 'course_url', 'status'],
    include: [{
      model: Order,
      as: 'order',
      attributes: ['id', 'order_code', 'payment_status'],
      where: { payment_status: 'paid' }
    }]
  });

  if (!task) {
    throw new AppError('Task not found or order not paid', 404);
  }

  // Build where clause
  const where = { task_id: id };

  if (level) {
    where.level = level;
  }

  if (category) {
    where.category = category;
  }

  if (source) {
    where.source = source;
  }

  // Fetch task logs
  const logs = await TaskLog.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit: parseInt(limit),
    attributes: [
      'id',
      'level',
      'category',
      'message',
      'details',
      'progress_percent',
      'current_file',
      'source',
      'created_at'
    ]
  });

  // Calculate summary
  const summary = {
    total: logs.length,
    errors: logs.filter(l => l.level === 'error' || l.level === 'critical').length,
    warnings: logs.filter(l => l.level === 'warn').length,
    info: logs.filter(l => l.level === 'info').length,
    latestProgress: null
  };

  // Get latest progress
  const latestProgressLog = logs.find(l => l.progress_percent !== null);
  if (latestProgressLog) {
    summary.latestProgress = parseFloat(latestProgressLog.progress_percent);
  }

  res.json({
    success: true,
    data: {
      taskId: id,
      orderId: task.order_id,
      orderCode: task.order?.order_code,
      courseUrl: task.course_url,
      taskStatus: task.status,
      logs: logs.map(log => ({
        id: log.id,
        timestamp: log.created_at,
        level: log.level,
        category: log.category,
        source: log.source,
        message: log.message,
        details: log.details,
        progress: log.progress_percent ? parseFloat(log.progress_percent) : null,
        currentFile: log.current_file
      })),
      total: logs.length,
      summary
    }
  });
});

/**
 * Get raw task log file content (worker download logs)
 * Returns the last N lines from the task log file
 * 
 * @route GET /api/admin/tasks/:id/logs/raw
 * @access Admin only
 * @query lines (default: 200)
 */
const getTaskLogsRaw = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lines = 200 } = req.query;

  // Verify task exists
  const task = await DownloadTask.findOne({
    where: { id },
    attributes: ['id', 'order_id', 'course_url', 'status'],
    include: [{
      model: Order,
      as: 'order',
      attributes: ['id', 'order_code', 'payment_status'],
      where: { payment_status: 'paid' }
    }]
  });

  if (!task) {
    throw new AppError('Task not found or order not paid', 404);
  }

  // Read task log file
  const taskLogger = require('../services/taskLogger.service');
  const logContent = await taskLogger.readTaskLog(id, parseInt(lines));

  res.json({
    success: true,
    data: {
      taskId: id,
      orderId: task.order_id,
      orderCode: task.order?.order_code,
      courseUrl: task.course_url,
      taskStatus: task.status,
      logs: logContent.split('\n').filter(line => line.trim()), // Split into lines
      totalLines: logContent.split('\n').filter(line => line.trim()).length,
      rawContent: logContent
    }
  });
});

/**
 * Get dashboard statistics for paid orders
 * 
 * @route GET /api/admin/dashboard/stats
 * @access Admin only
 */
const getDashboardStats = asyncHandler(async (req, res) => {
  // Get counts for paid orders
  const totalPaidOrders = await Order.count({
    where: { payment_status: 'paid' }
  });

  const processingOrders = await Order.count({
    where: { 
      payment_status: 'paid',
      order_status: 'processing'
    }
  });

  const completedOrders = await Order.count({
    where: { 
      payment_status: 'paid',
      order_status: 'completed'
    }
  });

  const failedOrders = await Order.count({
    where: { 
      payment_status: 'paid',
      order_status: 'failed'
    }
  });

  // Get task statistics for paid orders (using raw query to avoid ambiguity)
  const [taskStatsRaw] = await DownloadTask.sequelize.query(`
    SELECT dt.status, COUNT(dt.id) as count
    FROM download_tasks dt
    INNER JOIN orders o ON dt.order_id = o.id
    WHERE o.payment_status = 'paid'
    GROUP BY dt.status
  `);

  // Get recent errors
  const recentErrors = await OrderAuditLog.findAll({
    where: {
      severity: ['error', 'critical']
    },
    include: [
      {
        model: Order,
        as: 'order',
        where: { payment_status: 'paid' },
        attributes: ['order_code', 'user_email']
      }
    ],
    order: [['created_at', 'DESC']],
    limit: 10
  });

  res.json({
    success: true,
    data: {
      orders: {
        total: totalPaidOrders,
        processing: processingOrders,
        completed: completedOrders,
        failed: failedOrders
      },
      tasks: taskStatsRaw.reduce((acc, stat) => {
        acc[stat.status] = parseInt(stat.count);
        return acc;
      }, {}),
      recentErrors: recentErrors.map(log => ({
        orderId: log.order_id,
        orderCode: log.order.order_code,
        taskId: log.task_id,
        message: log.message,
        severity: log.severity,
        createdAt: log.created_at
      }))
    }
  });
});

module.exports = {
  getPaidOrders,
  getOrderDetails,
  getOrderAuditLogs,
  getTaskLogs,
  getTaskLogsRaw,
  getDashboardStats
};
