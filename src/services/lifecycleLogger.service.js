/**
 * Lifecycle Logger Service
 * Centralized logging for critical business events (Order, Payment, Enrollment, Download, Upload, Email, Grant)
 * Uses Winston for file-based logging with rotation
 * @module services/lifecycleLogger
 */

const winston = require('winston');
const path = require('path');
const DailyRotateFile = require('winston-daily-rotate-file');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
const fs = require('fs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for lifecycle logs
const lifecycleFormat = winston.format.printf(({ timestamp, level, message, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
});

// Create Winston logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    lifecycleFormat
  ),
  transports: [
    // Daily rotate file for lifecycle logs
    new DailyRotateFile({
      filename: path.join(logsDir, 'lifecycle-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d', // Keep 30 days of logs
      zippedArchive: true,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        lifecycleFormat
      )
    }),
    // Error-only log file
    new DailyRotateFile({
      filename: path.join(logsDir, 'lifecycle-error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d',
      zippedArchive: true
    })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV === 'development') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      lifecycleFormat
    )
  }));
}

/**
 * Log Order Creation
 * @param {number} orderId - Order ID
 * @param {string} email - Customer email
 * @param {number} totalAmount - Total order amount
 * @param {string} paymentStatus - Payment status
 * @param {Object} validationDetails - GetInfo validation results
 * @param {number} validationDetails.successCount - Number of successful validations
 * @param {number} validationDetails.totalCount - Total number of courses
 * @param {Array<string>} [validationDetails.failedUrls] - Failed URLs
 */
const logOrderCreated = (orderId, email, totalAmount, paymentStatus, validationDetails = {}) => {
  const { successCount = 0, totalCount = 0, failedUrls = [] } = validationDetails;
  const validationMsg = failedUrls.length > 0
    ? `GetInfo: ${successCount}/${totalCount} Success, Failed: ${failedUrls.join(', ')}`
    : `GetInfo: ${successCount}/${totalCount} Success`;

  logger.info(`[ORDER_CREATED] [OrderId: ${orderId}] [Email: ${email}] [Total: ${totalAmount}] [Status: ${paymentStatus}] [${validationMsg}]`, {
    orderId,
    email,
    totalAmount,
    paymentStatus,
    validationDetails
  });
};

/**
 * Log Enrollment Success
 * @param {number} orderId - Order ID
 * @param {number} taskId - Task ID
 * @param {string} email - Customer email
 * @param {string} [courseUrl] - Course URL
 */
const logEnrollSuccess = (orderId, taskId, email, courseUrl = null) => {
  logger.info(`[ENROLL_SUCCESS] [OrderId: ${orderId}] [TaskId: ${taskId}] [Email: ${email}]`, {
    orderId,
    taskId,
    email,
    courseUrl
  });
};

/**
 * Log Enrollment Error
 * @param {number} taskId - Task ID
 * @param {string} reason - Error reason
 * @param {Object} [details] - Additional error details
 */
const logEnrollError = (taskId, reason, details = {}) => {
  logger.error(`[ENROLL_ERROR] [TaskId: ${taskId}] [Reason: ${reason}]`, {
    taskId,
    reason,
    ...details
  });
};

/**
 * Log Download Success
 * @param {number} taskId - Task ID
 * @param {number} duration - Duration in seconds
 * @param {Object} [details] - Additional details
 */
const logDownloadSuccess = (taskId, duration, details = {}) => {
  logger.info(`[DOWNLOAD_SUCCESS] [TaskId: ${taskId}] [Duration: ${duration}s]`, {
    taskId,
    duration,
    ...details
  });
};

/**
 * Log Download Error
 * @param {number} taskId - Task ID
 * @param {string} reason - Error reason
 * @param {Object} [details] - Additional error details
 */
const logDownloadError = (taskId, reason, details = {}) => {
  logger.error(`[DOWNLOAD_ERROR] [TaskId: ${taskId}] [Reason: ${reason}]`, {
    taskId,
    reason,
    ...details
  });
};

/**
 * Log Upload Success
 * @param {number} taskId - Task ID
 * @param {string} driveLink - Google Drive link
 * @param {Object} [details] - Additional details
 */
const logUploadSuccess = (taskId, driveLink, details = {}) => {
  logger.info(`[UPLOAD_SUCCESS] [TaskId: ${taskId}] [DriveLink: ${driveLink}]`, {
    taskId,
    driveLink,
    ...details
  });
};

/**
 * Log Upload Error
 * @param {number} taskId - Task ID
 * @param {string} reason - Error reason
 * @param {Object} [details] - Additional error details
 */
const logUploadError = (taskId, reason, details = {}) => {
  logger.error(`[UPLOAD_ERROR] [TaskId: ${taskId}] [Reason: ${reason}]`, {
    taskId,
    reason,
    ...details
  });
};

/**
 * Log Email Sent Success
 * @param {number} orderId - Order ID
 * @param {string} email - Recipient email
 * @param {string} [emailType] - Type of email (completion, error, etc.)
 */
const logEmailSent = (orderId, email, emailType = 'completion') => {
  logger.info(`[EMAIL_SENT] [OrderId: ${orderId}] [To: ${email}] [Type: ${emailType}]`, {
    orderId,
    email,
    emailType
  });
};

/**
 * Log Email Error
 * @param {number} orderId - Order ID
 * @param {string} reason - Error reason
 * @param {Object} [details] - Additional error details
 */
const logEmailError = (orderId, reason, details = {}) => {
  logger.error(`[EMAIL_ERROR] [OrderId: ${orderId}] [Reason: ${reason}]`, {
    orderId,
    reason,
    ...details
  });
};

/**
 * Log Permission Granted Success
 * @param {number} taskId - Task ID
 * @param {string} userEmail - User email
 * @param {string} [driveLink] - Drive link
 */
const logPermissionGranted = (taskId, userEmail, driveLink = null) => {
  logger.info(`[PERMISSION_GRANTED] [TaskId: ${taskId}] [User: ${userEmail}]`, {
    taskId,
    userEmail,
    driveLink
  });
};

/**
 * Log Permission Error
 * @param {number} taskId - Task ID
 * @param {string} reason - Error reason
 * @param {Object} [details] - Additional error details
 */
const logPermissionError = (taskId, reason, details = {}) => {
  logger.error(`[PERMISSION_ERROR] [TaskId: ${taskId}] [Reason: ${reason}]`, {
    taskId,
    reason,
    ...details
  });
};

/**
 * Log Payment Received
 * @param {number} orderId - Order ID
 * @param {number} amount - Payment amount
 * @param {string} [paymentMethod] - Payment method
 */
const logPaymentReceived = (orderId, amount, paymentMethod = 'SePay') => {
  logger.info(`[PAYMENT_RECEIVED] [OrderId: ${orderId}] [Amount: ${amount}] [Method: ${paymentMethod}]`, {
    orderId,
    amount,
    paymentMethod
  });
};

/**
 * Generic log method for custom events
 * @param {string} eventType - Event type (e.g., 'CUSTOM_EVENT')
 * @param {string} message - Log message
 * @param {Object} [meta] - Additional metadata
 * @param {string} [level='info'] - Log level
 */
const logEvent = (eventType, message, meta = {}, level = 'info') => {
  const logMessage = `[${eventType}] ${message}`;
  logger[level](logMessage, meta);
};

module.exports = {
  logOrderCreated,
  logEnrollSuccess,
  logEnrollError,
  logDownloadSuccess,
  logDownloadError,
  logUploadSuccess,
  logUploadError,
  logEmailSent,
  logEmailError,
  logPermissionGranted,
  logPermissionError,
  logPaymentReceived,
  logEvent,
  // Export logger instance for advanced usage
  logger
};
