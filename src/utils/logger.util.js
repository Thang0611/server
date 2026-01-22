/**
 * Logger utility for consistent, colored logging
 * ✅ SECURITY: Production-ready with Winston file rotation to prevent disk full
 * @module utils/logger
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

/**
 * ANSI color codes for terminal output
 */
const Colors = {
  RESET: '\x1b[0m',
  BRIGHT: '\x1b[1m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  GRAY: '\x1b[90m'
};

/**
 * Format context object to short string
 * @param {Object} context - Context object
 * @returns {string} - Formatted string
 */
const formatContext = (context) => {
  if (!context || Object.keys(context).length === 0) return '';
  
  const parts = [];
  const importantKeys = ['taskId', 'orderId', 'orderCode', 'email', 'url', 'courseUrl', 'status', 'count'];
  
  for (const key of importantKeys) {
    if (context[key] !== undefined && context[key] !== null) {
      const value = typeof context[key] === 'string' && context[key].length > 50 
        ? context[key].substring(0, 47) + '...' 
        : context[key];
      parts.push(`${key}=${value}`);
    }
  }
  
  return parts.length > 0 ? ` [${parts.join(', ')}]` : '';
};

/**
 * Format timestamp to short format
 * @returns {string} - Formatted timestamp
 */
const formatTime = () => {
  const now = new Date();
  return now.toTimeString().substring(0, 8);
};

/**
 * ✅ SECURITY: Winston custom format for console output (colored)
 */
const consoleFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  const time = formatTime();
  const ctx = formatContext(metadata);
  const errorMsg = metadata.error ? `: ${metadata.error.message || metadata.error}` : '';
  
  // Color codes based on level
  let color = Colors.RESET;
  let prefix = level.toUpperCase();
  
  if (level === 'error') {
    color = Colors.RED + Colors.BRIGHT;
    prefix = '[ERROR]';
  } else if (level === 'warn') {
    color = Colors.YELLOW + Colors.BRIGHT;
    prefix = '[WARN]';
  } else if (level === 'info') {
    color = Colors.GREEN + Colors.BRIGHT;
    prefix = '[INFO]';
  } else if (level === 'debug') {
    color = Colors.CYAN;
    prefix = '[DEBUG]';
  }
  
  return `${color}${prefix}${Colors.RESET} ${Colors.GRAY}${time}${Colors.RESET} ${message}${errorMsg}${ctx}`;
});

/**
 * ✅ SECURITY: Winston custom format for file output (JSON for parsing)
 */
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

/**
 * ✅ SECURITY: Log rotation configuration to prevent disk full
 * Rotates logs daily and keeps 14 days of history
 */
const createRotateTransport = (level, filename) => {
  return new DailyRotateFile({
    level: level,
    filename: path.join(__dirname, '../../logs', `${filename}-%DATE%.log`),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m', // Rotate if file exceeds 20MB
    maxFiles: '14d', // Keep 14 days of logs
    format: fileFormat,
    zippedArchive: true, // Compress old log files
    auditFile: path.join(__dirname, '../../logs', '.audit.json')
  });
};

// ✅ SECURITY: Create Winston logger with file rotation
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: fileFormat,
  defaultMeta: { service: 'udemy-api' },
  transports: [
    // Write all logs to combined log file
    createRotateTransport('info', 'combined'),
    // Write error logs to error log file
    createRotateTransport('error', 'error'),
    // Also log to console in development
    ...(process.env.NODE_ENV !== 'production' ? [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          consoleFormat
        )
      })
    ] : [
      // In production, only log errors to console (less verbose)
      new winston.transports.Console({
        level: 'error',
        format: winston.format.combine(
          winston.format.colorize(),
          consoleFormat
        )
      })
    ])
  ],
  // ✅ SECURITY: Handle exceptions and rejections
  exceptionHandlers: [
    createRotateTransport('error', 'exceptions')
  ],
  rejectionHandlers: [
    createRotateTransport('error', 'rejections')
  ]
});

/**
 * ✅ SECURITY: Sanitize sensitive data from logs
 * Prevents logging of tokens, passwords, etc.
 */
const sanitizeContext = (context) => {
  if (!context || typeof context !== 'object') return context;
  
  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'access_token', 'refresh_token', 'bearer'];
  const sanitized = { ...context };
  
  for (const key in sanitized) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '***REDACTED***';
    }
  }
  
  return sanitized;
};

/**
 * Logger class with Winston backend
 */
class Logger {
  /**
   * Log error message (RED)
   * @param {string} message - Error message
   * @param {Error} [error] - Error object
   * @param {Object} [context] - Additional context
   */
  static error(message, error = null, context = {}) {
    const sanitizedContext = sanitizeContext(context);
    logger.error(message, {
      error: error ? {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      } : undefined,
      ...sanitizedContext
    });
    
    // Also log to console in development for immediate feedback
    if (process.env.NODE_ENV === 'development' && error && error.stack) {
      console.error(`${Colors.GRAY}${error.stack}${Colors.RESET}`);
    }
  }

  /**
   * Log warning message (YELLOW)
   * @param {string} message - Warning message
   * @param {Object} [context] - Additional context
   */
  static warn(message, context = {}) {
    const sanitizedContext = sanitizeContext(context);
    logger.warn(message, sanitizedContext);
  }

  /**
   * Log info message (GREEN)
   * @param {string} message - Info message
   * @param {Object} [context] - Additional context
   */
  static info(message, context = {}) {
    const sanitizedContext = sanitizeContext(context);
    logger.info(message, sanitizedContext);
  }

  /**
   * Log debug message (CYAN) - only in development
   * @param {string} message - Debug message
   * @param {Object} [context] - Additional context
   */
  static debug(message, context = {}) {
    if (process.env.NODE_ENV === 'development' || process.env.LOG_LEVEL === 'debug') {
      const sanitizedContext = sanitizeContext(context);
      logger.debug(message, sanitizedContext);
    }
  }

  /**
   * Log success message (GREEN with checkmark)
   * @param {string} message - Success message
   * @param {Object} [context] - Additional context
   */
  static success(message, context = {}) {
    const sanitizedContext = sanitizeContext(context);
    logger.info(`✓ ${message}`, sanitizedContext);
    
    // Also log to console with colored output in development
    if (process.env.NODE_ENV === 'development') {
      const time = formatTime();
      const ctx = formatContext(sanitizedContext);
      console.log(
        `${Colors.GREEN}${Colors.BRIGHT}✓${Colors.RESET} ${Colors.GREEN}[SUCCESS]${Colors.RESET} ${Colors.GRAY}${time}${Colors.RESET} ${message}${ctx}`
      );
    }
  }
}

module.exports = Logger;
