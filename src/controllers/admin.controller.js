/**
 * Admin Controller - Dashboard for monitoring paid orders
 * @module controllers/admin
 */

const { Order, DownloadTask, OrderAuditLog, TaskLog, Course } = require('../models');
const auditService = require('../services/audit.service');
const { asyncHandler } = require('../middleware/errorHandler.middleware');
const { AppError } = require('../middleware/errorHandler.middleware');
const Logger = require('../utils/logger.util');
const { Op } = require('sequelize');
const { sendBatchCompletionEmail } = require('../services/email.service');
const { addDownloadJob } = require('../queues/download.queue');
const { TASK_STATUS, IN_PROGRESS_STATUSES } = require('../constants/taskStatus');
const enrollService = require('../services/enroll.service');
const downloadWorker = require('../workers/download.worker');

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

/**
 * Resend completion email for an order
 * 
 * @route POST /api/admin/orders/:id/resend-email
 * @access Admin only
 */
const resendOrderEmail = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Verify order exists and is paid
  const order = await Order.findOne({
    where: {
      id,
      payment_status: 'paid'
    },
    attributes: ['id', 'order_code', 'user_email', 'total_amount']
  });

  if (!order) {
    throw new AppError('Order not found or not paid', 404);
  }

  // Get all tasks for this order
  const tasks = await DownloadTask.findAll({
    where: { order_id: id },
    attributes: [
      'id',
      'course_url',
      'title',
      'status',
      'drive_link',
      'error_log'
    ]
  });

  if (tasks.length === 0) {
    throw new AppError('No tasks found for this order', 404);
  }

  // Send batch completion email
  try {
    await sendBatchCompletionEmail(order, tasks);

    Logger.info('[Admin] Resent order completion email', {
      orderId: order.id,
      orderCode: order.order_code,
      email: order.user_email,
      taskCount: tasks.length
    });

    res.json({
      success: true,
      message: 'Email sent successfully',
      data: {
        orderId: order.id,
        orderCode: order.order_code,
        email: order.user_email,
        taskCount: tasks.length
      }
    });
  } catch (error) {
    Logger.error('[Admin] Failed to resend order email', error, {
      orderId: order.id,
      orderCode: order.order_code
    });
    throw new AppError(`Failed to send email: ${error.message}`, 500);
  }
});

/**
 * Retry download for non-completed courses in an order
 * Sets up automatic email notification when all tasks complete
 * 
 * @route POST /api/admin/orders/:id/retry-download
 * @access Admin only
 */
const retryOrderDownload = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { forceRedownload = true } = req.body; // ✅ Default: Always allow re-download of completed tasks

  Logger.info('[Admin] Retry download triggered', { orderId: id, forceRedownload });

  // Step 1: Get order details
  const order = await Order.findOne({
    where: {
      id,
      payment_status: 'paid'
    },
    attributes: ['id', 'order_code', 'user_email', 'total_amount']
  });

  if (!order) {
    throw new AppError('Order not found or not paid', 404);
  }

  // Step 2: Get all tasks and filter non-completed ones
  const allTasks = await DownloadTask.findAll({
    where: { order_id: id },
    attributes: [
      'id',
      'course_url',
      'title',
      'status',
      'email',
      'drive_link',
      'error_log'
    ]
  });

  if (allTasks.length === 0) {
    throw new AppError('No tasks found for this order', 404);
  }

  // ✅ MODIFIED: If forceRedownload, include completed tasks too
  const tasksToRetry = forceRedownload
    ? allTasks  // Re-download ALL tasks including completed
    : allTasks.filter(task => task.status !== TASK_STATUS.COMPLETED);

  const completedTasks = allTasks.filter(task => task.status === TASK_STATUS.COMPLETED);

  if (tasksToRetry.length === 0) {
    return res.json({
      success: true,
      message: 'No tasks need retry - all tasks are already completed. Set forceRedownload=true to re-download.',
      data: {
        orderId: order.id,
        orderCode: order.order_code,
        totalTasks: allTasks.length,
        completedTasks: completedTasks.length,
        retriedTasks: 0
      }
    });
  }

  // Step 3: Process tasks by status
  // Separate tasks into 'enrolled' (can queue directly) and others (need enrollment first)
  const enrolledTasksToQueue = tasksToRetry.filter(t => t.status === TASK_STATUS.ENROLLED);
  const tasksNeedingEnrollment = tasksToRetry.filter(t => t.status !== TASK_STATUS.ENROLLED);

  let enrolledCount = 0;
  let enrollFailedCount = 0;
  let queuedCount = 0;
  let queueErrors = [];

  // Step 3a: Process tasks that need enrollment (failed, processing, pending, etc.)
  for (const task of tasksNeedingEnrollment) {
    try {
      // Reset task to 'processing' status (if not already processing)
      // This allows re-enrollment for failed/pending tasks
      if (task.status !== TASK_STATUS.PROCESSING) {
        await DownloadTask.update(
          {
            status: TASK_STATUS.PROCESSING,
            error_log: null
          },
          {
            where: { id: task.id },
            fields: ['status', 'error_log']
          }
        );
      }

      // Enroll the course
      Logger.info('[Admin] Re-enrolling task', {
        taskId: task.id,
        orderId: order.id,
        previousStatus: task.status,
        courseUrl: task.course_url
      });

      const enrollResults = await enrollService.enrollCourses(
        [task.course_url],
        task.email,
        order.id
      );

      const enrollResult = enrollResults[0];
      if (enrollResult && enrollResult.success && enrollResult.status === 'enrolled') {
        // Verify status updated in DB
        const updatedTask = await DownloadTask.findByPk(task.id);
        if (updatedTask && updatedTask.status === TASK_STATUS.ENROLLED) {
          enrolledTasksToQueue.push(updatedTask); // Add to queue list
          enrolledCount++;
        } else {
          enrollFailedCount++;
          Logger.warn('[Admin] Enrollment status not verified', {
            taskId: task.id,
            expectedStatus: TASK_STATUS.ENROLLED,
            actualStatus: updatedTask?.status
          });
        }
      } else {
        enrollFailedCount++;
        Logger.error('[Admin] Re-enrollment failed', new Error(enrollResult?.message || 'Unknown error'), {
          taskId: task.id,
          enrollResult
        });
      }
    } catch (error) {
      enrollFailedCount++;
      Logger.error('[Admin] Failed to re-enroll task', error, {
        taskId: task.id,
        orderId: order.id
      });
    }
  }

  // Step 3b: Queue all enrolled tasks for download
  for (const task of enrolledTasksToQueue) {
    try {
      await addDownloadJob({
        taskId: task.id,
        email: task.email,
        courseUrl: task.course_url
      });
      queuedCount++;

      Logger.info('[Admin] Task queued for download retry', {
        taskId: task.id,
        orderId: order.id,
        courseUrl: task.course_url
      });
    } catch (error) {
      queueErrors.push({
        taskId: task.id,
        error: error.message
      });
      Logger.error('[Admin] Failed to queue task for retry', error, {
        taskId: task.id,
        orderId: order.id
      });
    }
  }

  // Step 4: Start completion tracking (polling mechanism)
  // This will monitor tasks and send email when all are completed
  startOrderCompletionTracking(order.id, order.order_code, order.user_email);

  const message = tasksNeedingEnrollment.length > 0
    ? `Re-enrolled ${enrolledCount} task(s), queued ${queuedCount} task(s) for download. ${enrollFailedCount > 0 ? `${enrollFailedCount} enrollment(s) failed.` : ''}`
    : `Queued ${queuedCount} task(s) for download`;

  res.json({
    success: true,
    message,
    data: {
      orderId: order.id,
      orderCode: order.order_code,
      totalTasks: allTasks.length,
      completedTasks: completedTasks.length,
      retriedTasks: tasksToRetry.length,
      enrolledTasks: enrolledCount,
      enrollFailed: enrollFailedCount,
      queuedTasks: queuedCount,
      queueErrors: queueErrors.length > 0 ? queueErrors : undefined
    }
  });
});

/**
 * Starts polling mechanism to track order completion
 * Sends email automatically when all tasks reach 'completed' status
 * 
 * @param {number} orderId - Order ID
 * @param {string} orderCode - Order code
 * @param {string} userEmail - User email
 */
let trackingIntervals = new Map(); // Track active polling intervals

const startOrderCompletionTracking = (orderId, orderCode, userEmail) => {
  // Clear any existing tracking for this order
  if (trackingIntervals.has(orderId)) {
    clearInterval(trackingIntervals.get(orderId));
  }

  const POLL_INTERVAL = 300000; // Check every 5 minutes
  const MAX_POLL_DURATION = 10800000; // Stop after 3 hours
  const startTime = Date.now();

  Logger.info('[Admin] Starting order completion tracking', {
    orderId,
    orderCode,
    pollInterval: POLL_INTERVAL,
    maxDuration: MAX_POLL_DURATION
  });

  const checkInterval = setInterval(async () => {
    try {
      // Check if max duration exceeded
      if (Date.now() - startTime > MAX_POLL_DURATION) {
        clearInterval(checkInterval);
        trackingIntervals.delete(orderId);
        Logger.warn('[Admin] Order completion tracking timeout', {
          orderId,
          orderCode,
          duration: MAX_POLL_DURATION
        });
        return;
      }

      // Get all tasks for this order
      const tasks = await DownloadTask.findAll({
        where: { order_id: orderId },
        attributes: ['id', 'status', 'drive_link', 'title', 'course_url', 'email']
      });

      if (tasks.length === 0) {
        clearInterval(checkInterval);
        trackingIntervals.delete(orderId);
        Logger.warn('[Admin] No tasks found for tracking', { orderId });
        return;
      }

      // Check if all tasks are completed
      const allCompleted = tasks.every(task => task.status === TASK_STATUS.COMPLETED);
      const inProgressCount = tasks.filter(task =>
        IN_PROGRESS_STATUSES.includes(task.status)
      ).length;

      if (allCompleted) {
        // All tasks completed - send email and stop tracking
        clearInterval(checkInterval);
        trackingIntervals.delete(orderId);

        try {
          const order = await Order.findByPk(orderId, {
            attributes: ['id', 'order_code', 'user_email', 'total_amount']
          });

          if (order) {
            await sendBatchCompletionEmail(order, tasks);

            Logger.success('[Admin] Order completion email sent automatically', {
              orderId,
              orderCode,
              email: userEmail,
              taskCount: tasks.length
            });
          }
        } catch (emailError) {
          Logger.error('[Admin] Failed to send automatic completion email', emailError, {
            orderId,
            orderCode,
            email: userEmail
          });
        }
      } else {
        // Still in progress - log status
        Logger.debug('[Admin] Order still processing', {
          orderId,
          orderCode,
          totalTasks: tasks.length,
          inProgress: inProgressCount,
          completed: tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length
        });
      }
    } catch (error) {
      Logger.error('[Admin] Error in completion tracking', error, {
        orderId,
        orderCode
      });
    }
  }, POLL_INTERVAL);

  // Store interval for cleanup
  trackingIntervals.set(orderId, checkInterval);
};

/**
 * Recover stuck tasks for all orders (auto-recovery)
 * @route POST /api/admin/tasks/recover
 * @access Admin only
 */
const recoverAllStuckTasks = asyncHandler(async (req, res) => {
  const taskRecoveryService = require('../services/taskRecovery.service');
  const { maxTasks = 100 } = req.body;

  Logger.info('[Admin] Manual recovery triggered', { maxTasks });

  try {
    const result = await taskRecoveryService.recoverStuckTasks({
      maxTasks: parseInt(maxTasks, 10)
    });

    res.json({
      success: true,
      message: result.message,
      data: result
    });
  } catch (error) {
    Logger.error('[Admin] Recovery failed', error);
    throw new AppError(`Recovery failed: ${error.message}`, 500);
  }
});

/**
 * Recover stuck tasks for a specific order
 * @route POST /api/admin/orders/:id/recover
 * @access Admin only
 */
const recoverOrderTasks = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const taskRecoveryService = require('../services/taskRecovery.service');

  Logger.info('[Admin] Manual order recovery triggered', { orderId: id });

  const order = await Order.findByPk(id, {
    attributes: ['id', 'order_code', 'payment_status']
  });

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  if (order.payment_status !== 'paid') {
    throw new AppError('Order is not paid, cannot recover tasks', 400);
  }

  try {
    const result = await taskRecoveryService.recoverOrderTasks(parseInt(id, 10));

    res.json({
      success: true,
      message: `Recovered ${result.recovered} task(s) for order ${order.order_code}`,
      data: {
        orderId: order.id,
        orderCode: order.order_code,
        ...result
      }
    });
  } catch (error) {
    Logger.error('[Admin] Order recovery failed', error, { orderId: id });
    throw new AppError(`Recovery failed: ${error.message}`, 500);
  }
});

/**
 * Trigger download for a course (permanent download)
 * @route POST /api/admin/courses/:id/download
 * @access Admin only
 * @body {string} [email] - Optional email for enrollment (defaults to ADMIN_EMAIL)
 */
const triggerCourseDownload = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { email: requestEmail } = req.body;

  // ✅ FIX: Always use getcourses.net@gmail.com for admin downloads (required for enrollment)
  // Override ADMIN_EMAIL env var to ensure correct email is used
  const email = requestEmail || 'getcourses.net@gmail.com';

  Logger.info('[Admin] Trigger course download', {
    courseId: id,
    email: email
  });

  // Validate email format if provided
  if (requestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestEmail)) {
    throw new AppError('Email không hợp lệ', 400);
  }

  // Find course by ID
  const course = await Course.findByPk(id, {
    attributes: ['id', 'title', 'course_url', 'drive_link']
  });

  if (!course) {
    throw new AppError('Course not found', 404);
  }

  // Check if course already has drive_link
  if (course.drive_link) {
    throw new AppError('Course already has drive link', 400);
  }

  if (!course.course_url) {
    throw new AppError('Course does not have course_url', 400);
  }

  try {
    // Use dedicated admin download service
    const adminDownloadService = require('../services/adminDownload.service');
    const result = await adminDownloadService.triggerAdminDownload(id, email);

    res.json({
      success: true,
      message: 'Download task created and processing started',
      data: result
    });
  } catch (error) {
    Logger.error('[Admin] Failed to trigger course download', error, {
      courseId: id
    });
    throw new AppError(`Failed to trigger download: ${error.message}`, 500);
  }
});

/**
 * Check cookie validity for Udemy downloads
 *
 * @route GET /api/admin/system/check-cookie
 * @access Admin only
 */
const checkCookie = asyncHandler(async (req, res) => {
  const { skipValidation } = req.query;

  try {
    const { getCookieStatus } = require('../utils/cookieValidator.util');
    const status = await getCookieStatus(skipValidation === 'true');

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    Logger.error('[Admin] Failed to check cookie', error);
    throw new AppError(`Failed to check cookie: ${error.message}`, 500);
  }
});

/**
 * Extract and save course metadata from VPS storage
 * Called by worker after copying course to VPS
 *
 * @route POST /api/admin/courses/:id/extract-metadata
 * @access Admin or Internal Worker
 */
const extractCourseMetadata = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { vps_path, secret_key, task_id } = req.body;

  // Verify internal secret for worker calls
  const expectedSecret = process.env.API_SECRET_KEY || 'KEY_BAO_MAT_CUA_BAN_2025';
  if (secret_key !== expectedSecret) {
    throw new AppError('Unauthorized', 401);
  }

  Logger.info('[Admin] Extract course metadata', {
    courseId: id,
    vpsPath: vps_path,
    taskId: task_id
  });

  // Verify course exists
  const course = await Course.findByPk(id);
  if (!course) {
    throw new AppError('Course not found', 404);
  }

  try {
    const courseMetadataService = require('../services/courseMetadata.service');
    const result = await courseMetadataService.extractAndSaveMetadata(parseInt(id), vps_path);

    Logger.success('[Admin] Course metadata extracted', {
      courseId: id,
      sections: result.sections,
      lectures: result.lectures
    });

    res.json({
      success: true,
      message: 'Metadata extracted successfully',
      data: result
    });
  } catch (error) {
    Logger.error('[Admin] Failed to extract metadata', error, {
      courseId: id,
      vpsPath: vps_path
    });
    throw new AppError(`Failed to extract metadata: ${error.message}`, 500);
  }
});

module.exports = {
  getPaidOrders,
  getOrderDetails,
  getOrderAuditLogs,
  getTaskLogs,
  getTaskLogsRaw,
  getDashboardStats,
  resendOrderEmail,
  retryOrderDownload,
  recoverAllStuckTasks,
  recoverOrderTasks,
  triggerCourseDownload,
  checkCookie,
  extractCourseMetadata
};
