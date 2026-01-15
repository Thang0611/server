/**
 * Audit Service - Persistent System Audit Logs
 * Logs all critical state changes for orders and tasks
 * @module services/audit
 */

const OrderAuditLog = require('../models/orderAuditLog.model');
const Logger = require('../utils/logger.util');

/**
 * Log an audit event
 * @param {Object} eventData - Event data
 * @param {number} eventData.orderId - Order ID
 * @param {number} [eventData.taskId] - Task ID (optional)
 * @param {string} eventData.eventType - Event type (e.g., 'payment_received')
 * @param {string} eventData.eventCategory - Category: 'payment', 'enrollment', 'download', 'notification', 'system'
 * @param {string} [eventData.severity='info'] - Severity: 'info', 'warning', 'error', 'critical'
 * @param {string} eventData.message - Human-readable message
 * @param {Object} [eventData.details] - Additional context (JSON)
 * @param {string} [eventData.previousStatus] - Previous status
 * @param {string} [eventData.newStatus] - New status
 * @param {string} eventData.source - Source of log: 'node_worker', 'python_worker', 'webhook_handler', etc.
 * @param {string} [eventData.ipAddress] - IP address
 * @param {string} [eventData.userAgent] - User agent
 * @returns {Promise<Object>} - Created audit log
 */
const logEvent = async (eventData) => {
  try {
    const {
      orderId,
      taskId = null,
      eventType,
      eventCategory,
      severity = 'info',
      message,
      details = null,
      previousStatus = null,
      newStatus = null,
      source,
      ipAddress = null,
      userAgent = null
    } = eventData;

    // Validate required fields
    if (!orderId || !eventType || !eventCategory || !message || !source) {
      const missingFields = [];
      if (!orderId) missingFields.push('orderId');
      if (!eventType) missingFields.push('eventType');
      if (!eventCategory) missingFields.push('eventCategory');
      if (!message) missingFields.push('message');
      if (!source) missingFields.push('source');
      
      Logger.error('Missing required audit log fields', new Error(`Missing: ${missingFields.join(', ')}`), { eventData });
      return null;
    }

    // FIX: Add detailed logging before creating audit log
    Logger.debug('[AUDIT] Creating audit log', {
      orderId,
      taskId,
      eventType,
      eventCategory,
      severity,
      source
    });

    const auditLog = await OrderAuditLog.create({
      order_id: orderId,
      task_id: taskId,
      event_type: eventType,
      event_category: eventCategory,
      severity,
      message,
      details,
      previous_status: previousStatus,
      new_status: newStatus,
      source,
      ip_address: ipAddress,
      user_agent: userAgent
    });

    // FIX: Verify audit log was created
    if (!auditLog || !auditLog.id) {
      Logger.error('[AUDIT] Audit log creation returned null/undefined', null, { eventData });
      return null;
    }

    // Log to console for monitoring
    const logLevel = severity === 'error' || severity === 'critical' ? 'error' : 'info';
    Logger[logLevel]('[AUDIT] Log created successfully', {
      auditLogId: auditLog.id,
      orderId,
      taskId,
      eventType,
      severity,
      message
    });

    return auditLog;
  } catch (error) {
    // Don't throw - audit logs should never break the main flow
    Logger.error('Failed to create audit log', error, { 
      eventData,
      errorMessage: error?.message,
      errorStack: error?.stack
    });
    return null;
  }
};

/**
 * Helper: Log payment event
 */
const logPayment = async (orderId, message, details = {}) => {
  return logEvent({
    orderId,
    eventType: 'payment_received',
    eventCategory: 'payment',
    severity: 'info',
    message,
    details,
    source: 'webhook_handler'
  });
};

/**
 * Helper: Log enrollment event
 */
const logEnrollment = async (orderId, taskId, success, message, details = {}) => {
  return logEvent({
    orderId,
    taskId,
    eventType: success ? 'enrollment_success' : 'enrollment_failed',
    eventCategory: 'enrollment',
    severity: success ? 'info' : 'error',
    message,
    details,
    source: 'node_worker'
  });
};

/**
 * Helper: Log download event
 */
const logDownload = async (orderId, taskId, eventType, message, details = {}, severity = 'info') => {
  return logEvent({
    orderId,
    taskId,
    eventType,
    eventCategory: 'download',
    severity,
    message,
    details,
    source: 'python_worker'
  });
};

/**
 * Helper: Log status change
 */
const logStatusChange = async (orderId, taskId, previousStatus, newStatus, source = 'system') => {
  return logEvent({
    orderId,
    taskId,
    eventType: 'status_change',
    eventCategory: 'system',
    severity: 'info',
    message: `Status changed: ${previousStatus} → ${newStatus}`,
    previousStatus,
    newStatus,
    source
  });
};

/**
 * Helper: Log error with automatic severity escalation
 */
const logError = async (orderId, taskId, message, errorDetails, source = 'system') => {
  // Determine severity based on error type
  let severity = 'error';
  let eventType = 'download_failed';
  let category = 'download';

  if (message.includes('enroll')) {
    eventType = 'enrollment_failed';
    category = 'enrollment';
  }
  
  if (message.includes('critical') || message.includes('fatal')) {
    severity = 'critical';
  }

  return logEvent({
    orderId,
    taskId,
    eventType,
    eventCategory: category,
    severity,
    message,
    details: {
      error: errorDetails?.message || errorDetails,
      stack: errorDetails?.stack,
      timestamp: new Date().toISOString()
    },
    source
  });
};

/**
 * Get audit logs for an order
 * @param {number} orderId - Order ID
 * @param {Object} options - Query options
 * @param {string} [options.severity] - Filter by severity
 * @param {string} [options.category] - Filter by category
 * @param {number} [options.limit=100] - Limit results
 * @returns {Promise<Array>} - Audit logs
 */
const getOrderLogs = async (orderId, options = {}) => {
  try {
    const where = { order_id: orderId };

    if (options.severity) {
      where.severity = options.severity;
    }

    if (options.category) {
      where.event_category = options.category;
    }

    const logs = await OrderAuditLog.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: options.limit || 100,
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
      ],
      raw: false // Return Sequelize instances to ensure proper date handling
    });

    // Ensure created_at is properly formatted as ISO string
    return logs.map(log => {
      const logData = log.toJSON();
      if (logData.created_at) {
        // Convert to ISO string if it's a Date object
        logData.created_at = logData.created_at instanceof Date 
          ? logData.created_at.toISOString() 
          : new Date(logData.created_at).toISOString();
      }
      return logData;
    });
  } catch (error) {
    Logger.error('Failed to fetch order audit logs', error, { orderId });
    return [];
  }
};

/**
 * Get error summary for an order
 * @param {number} orderId - Order ID
 * @returns {Promise<Object>} - Error summary
 */
const getOrderErrorSummary = async (orderId) => {
  try {
    const errors = await OrderAuditLog.findAll({
      where: {
        order_id: orderId,
        severity: ['error', 'critical']
      },
      attributes: [
        'event_type',
        'severity',
        'message',
        'created_at'
      ],
      order: [['created_at', 'DESC']]
    });

    return {
      totalErrors: errors.length,
      criticalCount: errors.filter(e => e.severity === 'critical').length,
      errorCount: errors.filter(e => e.severity === 'error').length,
      lastError: errors[0] || null,
      errors
    };
  } catch (error) {
    Logger.error('Failed to fetch error summary', error, { orderId });
    return {
      totalErrors: 0,
      criticalCount: 0,
      errorCount: 0,
      lastError: null,
      errors: []
    };
  }
};

module.exports = {
  logEvent,
  logPayment,
  logEnrollment,
  logDownload,
  logStatusChange,
  logError,
  getOrderLogs,
  getOrderErrorSummary
};
