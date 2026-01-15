/**
 * Task Logger Service
 * Per-task temporary log files for tracking download progress
 * Logs are stored in logs/tasks/{taskId}.log and can be cleaned up after completion
 * ENHANCED: Now uses UnifiedLogger for database storage and fixes race conditions
 * @module services/taskLogger
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const UnifiedLogger = require('./unifiedLogger.service');
const Logger = require('../utils/logger.util');

// Ensure tasks log directory exists
const tasksLogDir = path.join(__dirname, '../../logs/tasks');
if (!fs.existsSync(tasksLogDir)) {
  fs.mkdirSync(tasksLogDir, { recursive: true });
}

/**
 * Get task log file path
 * @param {number} taskId - Task ID
 * @returns {string} - Log file path
 */
const getTaskLogPath = (taskId) => {
  return path.join(tasksLogDir, `task-${taskId}.log`);
};

/**
 * Write log entry to task log file (async, thread-safe)
 * Also stores in database via UnifiedLogger
 * @param {number} taskId - Task ID
 * @param {number} [orderId] - Order ID (optional, for database correlation)
 * @param {string} message - Log message
 * @param {string} [level='INFO'] - Log level
 * @param {Object} [details] - Additional context
 * @param {number} [progress] - Progress percentage (0-100)
 * @param {string} [currentFile] - Current file being processed
 */
const writeTaskLog = async (taskId, message, level = 'INFO', orderId = null, details = {}, progress = null, currentFile = null) => {
  try {
    const logPath = getTaskLogPath(taskId);
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;
    
    // Write to file (async, non-blocking)
    await fsPromises.appendFile(logPath, logEntry, 'utf8');
    
    // Also store in database via UnifiedLogger if orderId is provided
    if (orderId) {
      // Map level to unified logger format
      const unifiedLevel = level.toLowerCase() === 'error' ? 'error' :
                          level.toLowerCase() === 'warn' ? 'warn' :
                          level.toLowerCase() === 'debug' ? 'debug' : 'info';
      
      // Use UnifiedLogger for database storage (non-blocking)
      UnifiedLogger.log({
        taskId,
        orderId,
        level: unifiedLevel,
        category: 'download',
        message,
        details,
        progress,
        currentFile,
        source: 'node_worker'
      }).catch(err => {
        // Don't throw - database logging failure shouldn't break file logging
        Logger.debug('[TaskLogger] Failed to store log in database', { taskId, error: err.message });
      });
    }
  } catch (error) {
    // Don't throw - task logging should never break the main flow
    Logger.error('[TaskLogger] Failed to write log', error, { taskId });
  }
};

/**
 * Synchronous version (for backward compatibility)
 * @deprecated Use async version with orderId for better tracking
 */
const writeTaskLogSync = (taskId, message, level = 'INFO') => {
  try {
    const logPath = getTaskLogPath(taskId);
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;
    
    fs.appendFileSync(logPath, logEntry, 'utf8');
  } catch (error) {
    // Don't throw - task logging should never break the main flow
    Logger.error('[TaskLogger] Failed to write log (sync)', error, { taskId });
  }
};

/**
 * Read task log file
 * @param {number} taskId - Task ID
 * @param {number} [lines] - Number of lines to read (from end). If not specified, reads entire file
 * @returns {Promise<string>} - Log content
 */
const readTaskLog = async (taskId, lines = null) => {
  try {
    const logPath = getTaskLogPath(taskId);
    
    if (!fs.existsSync(logPath)) {
      return '';
    }
    
    const content = await fsPromises.readFile(logPath, 'utf8');
    
    if (lines === null) {
      return content;
    }
    
    // Return last N lines
    const allLines = content.split('\n').filter(line => line.trim());
    const startIndex = Math.max(0, allLines.length - lines);
    return allLines.slice(startIndex).join('\n');
  } catch (error) {
    Logger.error('[TaskLogger] Failed to read log', error, { taskId });
    return '';
  }
};

/**
 * Synchronous version (for backward compatibility)
 * @deprecated Use async version
 */
const readTaskLogSync = (taskId, lines = null) => {
  try {
    const logPath = getTaskLogPath(taskId);
    
    if (!fs.existsSync(logPath)) {
      return '';
    }
    
    const content = fs.readFileSync(logPath, 'utf8');
    
    if (lines === null) {
      return content;
    }
    
    // Return last N lines
    const allLines = content.split('\n').filter(line => line.trim());
    const startIndex = Math.max(0, allLines.length - lines);
    return allLines.slice(startIndex).join('\n');
  } catch (error) {
    Logger.error('[TaskLogger] Failed to read log (sync)', error, { taskId });
    return '';
  }
};

/**
 * Parse progress percentage from log line
 * Supports formats like:
 * - "15%" 
 * - "Downloading: 50%"
 * - "[45%]"
 * @param {string} line - Log line
 * @returns {number|null} - Progress percentage (0-100) or null if not found
 */
const parseProgressFromLine = (line) => {
  if (!line) return null;
  
  // Match percentage patterns: 15%, 50%, etc.
  const percentageMatch = line.match(/(\d+(?:\.\d+)?)%/);
  if (percentageMatch) {
    const percent = parseFloat(percentageMatch[1]);
    if (percent >= 0 && percent <= 100) {
      return Math.round(percent);
    }
  }
  
  return null;
};

/**
 * Get latest progress from task log
 * Scans the log file backwards to find the most recent progress percentage
 * @param {number} taskId - Task ID
 * @returns {number|null} - Latest progress percentage (0-100) or null if not found
 */
const getLatestProgress = (taskId) => {
  try {
    const logPath = getTaskLogPath(taskId);
    
    if (!fs.existsSync(logPath)) {
      return null;
    }
    
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n').reverse(); // Read from end
    
    for (const line of lines) {
      const progress = parseProgressFromLine(line);
      if (progress !== null) {
        return progress;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`[TaskLogger] Failed to get progress for task ${taskId}:`, error.message);
    return null;
  }
};

/**
 * Delete task log file
 * @param {number} taskId - Task ID
 * @returns {boolean} - True if deleted successfully
 */
const deleteTaskLog = (taskId) => {
  try {
    const logPath = getTaskLogPath(taskId);
    
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`[TaskLogger] Failed to delete log for task ${taskId}:`, error.message);
    return false;
  }
};

/**
 * Clean up old task logs (older than specified days)
 * @param {number} daysOld - Delete logs older than this many days (default: 7)
 * @returns {number} - Number of files deleted
 */
const cleanupOldLogs = (daysOld = 7) => {
  try {
    if (!fs.existsSync(tasksLogDir)) {
      return 0;
    }
    
    const files = fs.readdirSync(tasksLogDir);
    const now = Date.now();
    const maxAge = daysOld * 24 * 60 * 60 * 1000; // Convert days to milliseconds
    let deletedCount = 0;
    
    for (const file of files) {
      if (!file.startsWith('task-') || !file.endsWith('.log')) {
        continue;
      }
      
      const filePath = path.join(tasksLogDir, file);
      const stats = fs.statSync(filePath);
      const fileAge = now - stats.mtimeMs;
      
      if (fileAge > maxAge) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }
    
    return deletedCount;
  } catch (error) {
    console.error(`[TaskLogger] Failed to cleanup old logs:`, error.message);
    return 0;
  }
};

/**
 * Stream task log file (for real-time monitoring)
 * Returns a readable stream of the log file
 * @param {number} taskId - Task ID
 * @returns {fs.ReadStream|null} - Readable stream or null if file doesn't exist
 */
const streamTaskLog = (taskId) => {
  try {
    const logPath = getTaskLogPath(taskId);
    
    if (!fs.existsSync(logPath)) {
      return null;
    }
    
    return fs.createReadStream(logPath, { encoding: 'utf8' });
  } catch (error) {
    console.error(`[TaskLogger] Failed to stream log for task ${taskId}:`, error.message);
    return null;
  }
};

module.exports = {
  writeTaskLog,        // Async version (recommended)
  writeTaskLogSync,    // Sync version (backward compatibility)
  readTaskLog,         // Async version (recommended)
  readTaskLogSync,     // Sync version (backward compatibility)
  getLatestProgress,
  parseProgressFromLine,
  deleteTaskLog,
  cleanupOldLogs,
  streamTaskLog,
  getTaskLogPath
};
