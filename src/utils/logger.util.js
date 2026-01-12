/**
 * Logger utility for consistent, colored logging
 * @module utils/logger
 */

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
 * Logger class with colored output
 */
class Logger {
  /**
   * Log error message (RED)
   * @param {string} message - Error message
   * @param {Error} [error] - Error object
   * @param {Object} [context] - Additional context
   */
  static error(message, error = null, context = {}) {
    const time = formatTime();
    const ctx = formatContext(context);
    const errorMsg = error ? `: ${error.message}` : '';
    
    console.error(
      `${Colors.RED}${Colors.BRIGHT}[ERROR]${Colors.RESET} ${Colors.GRAY}${time}${Colors.RESET} ${message}${errorMsg}${ctx}`
    );
    
    // Only show stack in development
    if (error && error.stack && process.env.NODE_ENV === 'development') {
      console.error(`${Colors.GRAY}${error.stack}${Colors.RESET}`);
    }
  }

  /**
   * Log warning message (YELLOW)
   * @param {string} message - Warning message
   * @param {Object} [context] - Additional context
   */
  static warn(message, context = {}) {
    const time = formatTime();
    const ctx = formatContext(context);
    
    console.warn(
      `${Colors.YELLOW}${Colors.BRIGHT}[WARN]${Colors.RESET}  ${Colors.GRAY}${time}${Colors.RESET} ${message}${ctx}`
    );
  }

  /**
   * Log info message (GREEN)
   * @param {string} message - Info message
   * @param {Object} [context] - Additional context
   */
  static info(message, context = {}) {
    const time = formatTime();
    const ctx = formatContext(context);
    
    console.log(
      `${Colors.GREEN}${Colors.BRIGHT}[INFO]${Colors.RESET}  ${Colors.GRAY}${time}${Colors.RESET} ${message}${ctx}`
    );
  }

  /**
   * Log debug message (CYAN) - only in development
   * @param {string} message - Debug message
   * @param {Object} [context] - Additional context
   */
  static debug(message, context = {}) {
    if (process.env.NODE_ENV === 'development') {
      const time = formatTime();
      const ctx = formatContext(context);
      
      console.log(
        `${Colors.CYAN}[DEBUG]${Colors.RESET} ${Colors.GRAY}${time}${Colors.RESET} ${message}${ctx}`
      );
    }
  }

  /**
   * Log success message (GREEN with checkmark)
   * @param {string} message - Success message
   * @param {Object} [context] - Additional context
   */
  static success(message, context = {}) {
    const time = formatTime();
    const ctx = formatContext(context);
    
    console.log(
      `${Colors.GREEN}${Colors.BRIGHT}✓${Colors.RESET} ${Colors.GREEN}[SUCCESS]${Colors.RESET} ${Colors.GRAY}${time}${Colors.RESET} ${message}${ctx}`
    );
  }
}

module.exports = Logger;
