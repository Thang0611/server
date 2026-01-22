/**
 * Unified Logger Service
 * Centralized logging system with structured JSON format
 * Handles: Database storage, File logging, Console output
 * @module services/unifiedLogger
 */

const fs = require('fs').promises;
const path = require('path');
const Logger = require('../utils/logger.util');

// Lazy load models to avoid circular dependencies
let TaskLog = null;
let OrderAuditLog = null;

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
const tasksLogDir = path.join(logsDir, 'tasks');

(async () => {
  try {
    await fs.mkdir(logsDir, { recursive: true });
    await fs.mkdir(tasksLogDir, { recursive: true });
  } catch (error) {
    // Directory might already exist, ignore
  }
})();

/**
 * Get model instances (lazy load to avoid circular deps)
 */
const getModels = () => {
  if (!TaskLog) {
    try {
      TaskLog = require('../models/taskLog.model');
    } catch (error) {
      // Model might not be loaded yet, will retry on next call
      return { TaskLog: null, OrderAuditLog: null };
    }
  }
  if (!OrderAuditLog) {
    try {
      OrderAuditLog = require('../models/orderAuditLog.model');
    } catch (error) {
      // Model might not be loaded yet, will retry on next call
      return { TaskLog, OrderAuditLog: null };
    }
  }
  return { TaskLog, OrderAuditLog };
};

/**
 * Format log entry as structured JSON
 * @param {Object} logData - Log data
 * @returns {string} - JSON string
 */
const formatLogEntry = (logData) => {
  const entry = {
    timestamp: new Date().toISOString(),
    level: logData.level || 'info',
    category: logData.category || 'system',
    source: logData.source || 'unknown',
    orderId: logData.orderId || null,
    taskId: logData.taskId || null,
    message: logData.message || '',
    details: logData.details || null,
    progress: logData.progress || null,
    currentFile: logData.currentFile || null,
    stack: logData.stack || null,
    metadata: logData.metadata || null
  };

  return JSON.stringify(entry) + '\n';
};

/**
 * Log to database (TaskLog or OrderAuditLog)
 * @param {Object} logData - Log data
 * @returns {Promise<Object|null>} - Created log record or null
 */
const logToDatabase = async (logData) => {
  try {
    const { TaskLog, OrderAuditLog } = getModels();

    // Determine which table to use
    const isTaskLog = logData.taskId && logData.category === 'download';
    const isAuditLog = logData.orderId && ['payment', 'enrollment', 'notification', 'system'].includes(logData.category);

    if (isTaskLog) {
      // Store in task_logs table
      const taskLog = await TaskLog.create({
        task_id: logData.taskId,
        order_id: logData.orderId,
        level: logData.level || 'info',
        category: logData.category || 'download',
        message: logData.message,
        details: logData.details || null,
        progress_percent: logData.progress || null,
        current_file: logData.currentFile || null,
        source: logData.source || 'unknown'
      });

      return taskLog;
    } else if (isAuditLog) {
      // Store in order_audit_logs table (use existing audit service)
      const auditService = require('./audit.service');
      
      // Map to audit log format
      const eventType = mapCategoryToEventType(logData.category, logData.message);
      
      return await auditService.logEvent({
        orderId: logData.orderId,
        taskId: logData.taskId || null,
        eventType: eventType,
        eventCategory: logData.category,
        severity: logData.level === 'error' ? 'error' : logData.level === 'warn' ? 'warning' : 'info',
        message: logData.message,
        details: logData.details || null,
        source: logData.source || 'unknown',
        ipAddress: logData.metadata?.ipAddress || null,
        userAgent: logData.metadata?.userAgent || null
      });
    }

    return null;
  } catch (error) {
    // Don't throw - logging should never break the main flow
    Logger.error('[UnifiedLogger] Failed to log to database', error, {
      logData: {
        orderId: logData.orderId,
        taskId: logData.taskId,
        category: logData.category
      }
    });
    return null;
  }
};

/**
 * Map category to audit event type
 * @param {string} category - Log category
 * @param {string} message - Log message
 * @returns {string} - Event type
 */
const mapCategoryToEventType = (category, message) => {
  const lowerMessage = message.toLowerCase();
  
  if (category === 'payment') {
    if (lowerMessage.includes('received')) return 'payment_received';
    if (lowerMessage.includes('verified')) return 'payment_verified';
    return 'payment_received';
  }
  
  if (category === 'enrollment') {
    if (lowerMessage.includes('started')) return 'enrollment_started';
    if (lowerMessage.includes('success')) return 'enrollment_success';
    if (lowerMessage.includes('failed')) return 'enrollment_failed';
    return 'enrollment_started';
  }
  
  if (category === 'download') {
    if (lowerMessage.includes('started')) return 'download_started';
    if (lowerMessage.includes('completed') || lowerMessage.includes('success')) return 'download_completed';
    if (lowerMessage.includes('failed')) return 'download_failed';
    return 'download_started';
  }
  
  if (category === 'notification') {
    if (lowerMessage.includes('email')) return 'email_sent';
    return 'email_sent';
  }
  
  return 'status_change';
};

/**
 * Log to file (with rotation)
 * @param {Object} logData - Log data
 * @returns {Promise<void>}
 */
const logToFile = async (logData) => {
  try {
    const entry = formatLogEntry(logData);
    
    // Determine file path
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    let filePath;

    if (logData.taskId && logData.category === 'download') {
      // Task-specific log file
      filePath = path.join(tasksLogDir, `task-${logData.taskId}.log`);
    } else {
      // General app log file
      filePath = path.join(logsDir, `app-${date}.log`);
    }

    // Append to file (async, non-blocking)
    await fs.appendFile(filePath, entry, 'utf8');
  } catch (error) {
    // Don't throw - file logging should never break the main flow
    Logger.error('[UnifiedLogger] Failed to log to file', error, {
      logData: {
        orderId: logData.orderId,
        taskId: logData.taskId
      }
    });
  }
};

/**
 * Log to console (development only)
 * @param {Object} logData - Log data
 */
const logToConsole = (logData) => {
  if (process.env.NODE_ENV === 'development') {
    const level = logData.level || 'info';
    const message = logData.message || '';
    const context = {
      orderId: logData.orderId,
      taskId: logData.taskId,
      category: logData.category,
      source: logData.source
    };

    if (level === 'error' || level === 'critical') {
      Logger.error(`[${logData.category?.toUpperCase()}] ${message}`, logData.error, context);
    } else if (level === 'warn') {
      Logger.warn(`[${logData.category?.toUpperCase()}] ${message}`, context);
    } else if (level === 'debug') {
      Logger.debug(`[${logData.category?.toUpperCase()}] ${message}`, context);
    } else {
      Logger.info(`[${logData.category?.toUpperCase()}] ${message}`, context);
    }
  }
};

/**
 * Unified Logger Class
 */
class UnifiedLogger {
  /**
   * Log an event (writes to database, file, and console)
   * @param {Object} logData - Log data
   * @param {number} [logData.orderId] - Order ID
   * @param {number} [logData.taskId] - Task ID
   * @param {string} logData.level - Log level: 'debug', 'info', 'warn', 'error', 'critical'
   * @param {string} logData.category - Category: 'order', 'payment', 'enrollment', 'download', 'upload', 'notification', 'system'
   * @param {string} logData.source - Source: 'node_worker', 'python_worker', 'webhook_handler', etc.
   * @param {string} logData.message - Log message
   * @param {Object} [logData.details] - Additional context
   * @param {number} [logData.progress] - Progress percentage (0-100)
   * @param {string} [logData.currentFile] - Current file being processed
   * @param {Error} [logData.error] - Error object (will extract stack)
   * @param {Object} [logData.metadata] - Additional metadata (ipAddress, userAgent, etc.)
   * @returns {Promise<Object|null>} - Created log record or null
   */
  static async log(logData) {
    // Extract stack trace from error if provided
    if (logData.error && logData.error.stack) {
      logData.stack = logData.error.stack;
      if (!logData.details) logData.details = {};
      logData.details.error = {
        message: logData.error.message,
        stack: logData.error.stack,
        name: logData.error.name
      };
    }

    // Log to console (synchronous, immediate)
    logToConsole(logData);

    // Log to database and file (async, non-blocking)
    const [dbLog] = await Promise.allSettled([
      logToDatabase(logData),
      logToFile(logData)
    ]);

    // FIX: Safely access .value property - check if dbLog exists and has value
    if (dbLog && dbLog.status === 'fulfilled' && dbLog.value !== undefined) {
      return dbLog.value;
    }
    return null;
  }

  /**
   * Log order event
   * @param {number} orderId - Order ID
   * @param {string} category - Category: 'order', 'payment', 'notification'
   * @param {string} message - Log message
   * @param {Object} [details] - Additional context
   * @param {string} [level='info'] - Log level
   * @param {string} [source='node_worker'] - Source
   * @returns {Promise<Object|null>}
   */
  static async logOrderEvent(orderId, category, message, details = {}, level = 'info', source = 'node_worker') {
    return this.log({
      orderId,
      category,
      message,
      details,
      level,
      source
    });
  }

  /**
   * Log task event
   * @param {number} taskId - Task ID
   * @param {number} orderId - Order ID
   * @param {string} category - Category: 'enrollment', 'download', 'upload'
   * @param {string} message - Log message
   * @param {Object} [details] - Additional context
   * @param {string} [level='info'] - Log level
   * @param {string} [source='python_worker'] - Source
   * @returns {Promise<Object|null>}
   */
  static async logTaskEvent(taskId, orderId, category, message, details = {}, level = 'info', source = 'python_worker') {
    return this.log({
      taskId,
      orderId,
      category,
      message,
      details,
      level,
      source
    });
  }

  /**
   * Log download progress
   * @param {number} taskId - Task ID
   * @param {number} orderId - Order ID
   * @param {number} progress - Progress percentage (0-100)
   * @param {string} [currentFile] - Current file being downloaded
   * @param {Object} [details] - Additional context (speed, eta, etc.)
   * @returns {Promise<Object|null>}
   */
  static async logProgress(taskId, orderId, progress, currentFile = null, details = {}) {
    return this.log({
      taskId,
      orderId,
      category: 'download',
      level: 'info',
      message: `Download progress: ${progress}%${currentFile ? ` (${currentFile})` : ''}`,
      progress,
      currentFile,
      details,
      source: 'python_worker'
    });
  }

  /**
   * Log error
   * @param {number} [orderId] - Order ID
   * @param {number} [taskId] - Task ID
   * @param {Error} error - Error object
   * @param {string} message - Error message
   * @param {Object} [context] - Additional context
   * @param {string} [source='system'] - Source
   * @returns {Promise<Object|null>}
   */
  static async logError(orderId, taskId, error, message, context = {}, source = 'system') {
    // Determine category from context or error message
    let category = 'system';
    if (taskId) {
      category = 'download'; // Default for task errors
    } else if (orderId) {
      category = 'order';
    }

    return this.log({
      orderId,
      taskId,
      category,
      level: 'error',
      message: message || error.message,
      error,
      details: context,
      source
    });
  }

  /**
   * Log debug message (only in development)
   * @param {number} [orderId] - Order ID
   * @param {number} [taskId] - Task ID
   * @param {string} message - Debug message
   * @param {Object} [details] - Additional context
   * @param {string} [source='system'] - Source
   * @returns {Promise<Object|null>}
   */
  static async logDebug(orderId, taskId, message, details = {}, source = 'system') {
    if (process.env.NODE_ENV !== 'development') {
      return null; // Skip in production
    }

    return this.log({
      orderId,
      taskId,
      category: 'system',
      level: 'debug',
      message,
      details,
      source
    });
  }
}

module.exports = UnifiedLogger;
