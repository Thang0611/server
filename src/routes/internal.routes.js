/**
 * Internal API routes (for inter-service communication)
 * @module routes/internal
 */

const express = require('express');
const router = express.Router();
const lifecycleLogger = require('../services/lifecycleLogger.service');
const UnifiedLogger = require('../services/unifiedLogger.service');
const Logger = require('../utils/logger.util');

/**
 * POST /api/v1/internal/lifecycle-log
 * Receives lifecycle log events from Python worker
 * This endpoint allows Python worker to send lifecycle events to Node.js backend
 */
router.post('/lifecycle-log', (req, res) => {
  try {
    const { eventType, message, meta = {} } = req.body;

    if (!eventType || !message) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: eventType, message'
      });
    }

    // Parse event type and route to appropriate lifecycle logger method
    switch (eventType) {
      case 'DOWNLOAD_SUCCESS':
        lifecycleLogger.logDownloadSuccess(
          meta.taskId,
          meta.duration || 0,
          meta
        );
        break;
      
      case 'DOWNLOAD_ERROR':
        lifecycleLogger.logDownloadError(
          meta.taskId,
          meta.reason || message,
          meta
        );
        break;
      
      case 'UPLOAD_SUCCESS':
        lifecycleLogger.logUploadSuccess(
          meta.taskId,
          meta.driveLink || meta.folderName || 'N/A',
          meta
        );
        break;
      
      case 'UPLOAD_ERROR':
        lifecycleLogger.logUploadError(
          meta.taskId,
          meta.reason || message,
          meta
        );
        break;
      
      default:
        // Generic event logging
        lifecycleLogger.logEvent(eventType, message, meta);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Internal API] Failed to process lifecycle log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process lifecycle log'
    });
  }
});

/**
 * POST /api/v1/internal/tasks/:taskId/logs
 * Receives task logs from Python worker
 * This endpoint allows Python worker to send structured logs to Node.js backend
 * for storage in task_logs database table
 */
router.post('/tasks/:taskId/logs', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { 
      orderId, 
      level = 'info', 
      category = 'download', 
      message, 
      details = {}, 
      progress = null,
      currentFile = null,
      source = 'python_worker'
    } = req.body;

    // Validate required fields
    if (!taskId || !orderId || !message) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: taskId, orderId, message'
      });
    }

    // Validate level
    const validLevels = ['debug', 'info', 'warn', 'error', 'critical'];
    if (!validLevels.includes(level)) {
      return res.status(400).json({
        success: false,
        message: `Invalid level. Must be one of: ${validLevels.join(', ')}`
      });
    }

    // Validate category
    const validCategories = ['download', 'upload', 'enrollment', 'system'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${validCategories.join(', ')}`
      });
    }

    // Log using unified logger
    const logRecord = await UnifiedLogger.log({
      taskId: parseInt(taskId),
      orderId: parseInt(orderId),
      level,
      category,
      message,
      details,
      progress: progress !== null ? parseFloat(progress) : null,
      currentFile,
      source
    });

    if (logRecord) {
      Logger.debug('[Internal API] Task log created', {
        taskId,
        orderId,
        logId: logRecord.id
      });
    }

    res.json({ 
      success: true,
      data: {
        logId: logRecord?.id || null
      }
    });
  } catch (error) {
    Logger.error('[Internal API] Failed to process task log', error, {
      taskId: req.params.taskId
    });
    res.status(500).json({
      success: false,
      message: 'Failed to process task log',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
