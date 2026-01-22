/**
 * Progress Service - Ephemeral Real-time Progress Tracking
 * Uses Redis Pub/Sub to broadcast download progress
 * THIS IS NOT SAVED TO DATABASE - Only for real-time UI updates
 * @module services/progress
 */

const redis = require('redis');
const Logger = require('../utils/logger.util');

// Redis client for publishing progress events
const redisPublisher = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  password: process.env.REDIS_PASSWORD || undefined,
});

// Redis client for subscribing to progress events
const redisSubscriber = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  password: process.env.REDIS_PASSWORD || undefined,
});

// Connection handlers - with extra safe error handling for node-redis v4
const handleRedisError = (clientName) => (err) => {
  try {
    // FIX: Super safe error handling - prevent any property access on undefined
    if (!err) {
      console.error(`${new Date().toISOString()} Redis ${clientName} Error: Unknown error`);
      return;
    }
    
    // Safely extract error message without accessing potentially undefined properties
    let errorMessage = 'Unknown error';
    try {
      if (typeof err === 'string') {
        errorMessage = err;
      } else if (err && typeof err.message === 'string') {
        errorMessage = err.message;
      } else if (err) {
        errorMessage = String(err);
      }
    } catch (e) {
      errorMessage = 'Error extracting message failed';
    }
    
    // Use console.error directly to avoid any Logger issues
    console.error(`${new Date().toISOString()} Redis ${clientName} Error: ${errorMessage}`);
  } catch (handlerError) {
    // Last resort - if even our error handler fails
    console.error('Redis error handler failed:', handlerError);
  }
};

redisPublisher.on('error', handleRedisError('Publisher'));
redisPublisher.on('connect', () => Logger.info('Redis Publisher Connected'));

redisSubscriber.on('error', handleRedisError('Subscriber'));
redisSubscriber.on('connect', () => Logger.info('Redis Subscriber Connected'));

// Initialize connections
(async () => {
  if (!redisPublisher.isOpen) {
    await redisPublisher.connect();
  }
  if (!redisSubscriber.isOpen) {
    await redisSubscriber.connect();
  }
})();

/**
 * REDIS CHANNEL NAMING CONVENTION
 * 
 * Pattern: {scope}:{id}:{type}
 * 
 * Examples:
 *   order:123:progress     - Overall progress for order #123
 *   task:456:progress      - Progress for specific task #456
 *   task:456:status        - Status change for task #456
 *   order:123:complete     - Order completion event
 */

/**
 * Publish progress update for a task
 * @param {number} taskId - Task ID
 * @param {Object} progressData - Progress data
 * @param {number} progressData.percent - Progress percentage (0-100)
 * @param {string} [progressData.currentFile] - Current file being downloaded
 * @param {number} [progressData.speed] - Download speed in bytes/sec
 * @param {string} [progressData.eta] - Estimated time remaining
 * @param {number} [progressData.bytesDownloaded] - Bytes downloaded
 * @param {number} [progressData.totalBytes] - Total bytes
 */
const publishTaskProgress = async (taskId, progressData) => {
  try {
    const channel = `task:${taskId}:progress`;
    
    const message = JSON.stringify({
      taskId,
      percent: Math.round(progressData.percent || 0),
      currentFile: progressData.currentFile || null,
      speed: progressData.speed || null,
      eta: progressData.eta || null,
      bytesDownloaded: progressData.bytesDownloaded || null,
      totalBytes: progressData.totalBytes || null,
      timestamp: Date.now()
    });

    await redisPublisher.publish(channel, message);

    // Also publish to order-level channel if orderId is available
    if (progressData.orderId) {
      const orderChannel = `order:${progressData.orderId}:progress`;
      await redisPublisher.publish(orderChannel, message);
    }

    // Log only at significant milestones to avoid spam
    if (progressData.percent % 10 === 0) {
      Logger.debug('[Progress] Published', {
        taskId,
        percent: progressData.percent,
        channel
      });
    }
  } catch (error) {
    // Don't throw - progress updates should never break the main flow
    Logger.error('Failed to publish task progress', error, { taskId });
  }
};

/**
 * Publish status change for a task
 * @param {number} taskId - Task ID
 * @param {number} orderId - Order ID
 * @param {string} newStatus - New status
 * @param {string} [previousStatus] - Previous status
 * @param {string} [message] - Optional message
 */
const publishTaskStatusChange = async (taskId, orderId, newStatus, previousStatus = null, message = null) => {
  try {
    const channels = [
      `task:${taskId}:status`,
      `order:${orderId}:status`
    ];

    const payload = JSON.stringify({
      taskId,
      orderId,
      newStatus,
      previousStatus,
      message,
      timestamp: Date.now()
    });

    for (const channel of channels) {
      await redisPublisher.publish(channel, payload);
    }

    Logger.info('[Status Change] Published', {
      taskId,
      orderId,
      status: `${previousStatus} → ${newStatus}`
    });
  } catch (error) {
    Logger.error('Failed to publish status change', error, { taskId, orderId });
  }
};

/**
 * Publish order completion event
 * @param {number} orderId - Order ID
 * @param {Object} completionData - Completion data
 */
const publishOrderComplete = async (orderId, completionData) => {
  try {
    const channel = `order:${orderId}:complete`;
    
    const message = JSON.stringify({
      orderId,
      totalTasks: completionData.totalTasks,
      completedTasks: completionData.completedTasks,
      failedTasks: completionData.failedTasks,
      timestamp: Date.now()
    });

    await redisPublisher.publish(channel, message);

    Logger.success('[Order Complete] Published', {
      orderId,
      channel
    });
  } catch (error) {
    Logger.error('Failed to publish order completion', error, { orderId });
  }
};

/**
 * Subscribe to progress updates for specific channels
 * @param {Array<string>} patterns - Channel patterns to subscribe to (supports wildcards)
 * @param {Function} callback - Callback function (channel, message) => void
 */
// FIX: Store callback globally so it can be called from pmessage handler
let progressCallback = null;

// FIX: Set up pmessage handler ONCE when module loads, not every time subscribeToProgress is called
// This ensures messages are always received even if subscribeToProgress is called multiple times
redisSubscriber.on('pmessage', (pattern, channel, message) => {
  // Only process if callback is set
  if (!progressCallback) {
    return;
  }
  
  try {
    // Validate message exists and is a string
    if (!message) {
      Logger.warn('[Progress] Received empty message from Redis', { pattern, channel });
      return;
    }

    // Convert Buffer to string if needed (node-redis v4 compatibility)
    const messageString = typeof message === 'string' ? message : message.toString('utf8');
    
    if (!messageString || messageString.trim().length === 0) {
      Logger.warn('[Progress] Received empty message string', { pattern, channel });
      return;
    }

    // FIX: Log all Redis messages to debug progress flow (only for progress channels to avoid spam)
    if (pattern.includes('progress')) {
      Logger.info('[Progress] Redis message received', { 
        pattern, 
        channel, 
        messageLength: messageString.length,
        messageType: typeof message,
        messagePreview: messageString.substring(0, 150)
      });
    }
    
    // Parse JSON message
    let data;
    try {
      data = JSON.parse(messageString);
    } catch (parseError) {
      Logger.error('Failed to parse JSON from Redis message', parseError, { 
        pattern, 
        channel, 
        messagePreview: messageString.substring(0, 200)
      });
      return;
    }
    
    // Validate parsed data
    if (!data || typeof data !== 'object') {
      Logger.warn('[Progress] Parsed data is not an object', { pattern, channel, data });
      return;
    }
    
    // FIX: Log progress data structure for debugging
    if (pattern.includes('progress') && data.percent !== undefined) {
      Logger.debug('[Progress] Parsed progress data', {
        channel,
        taskId: data.taskId,
        orderId: data.orderId,
        percent: data.percent,
        currentFile: data.currentFile || data.current_file
      });
    }
    
    // Call the callback with channel and parsed data
    progressCallback(channel, data);
  } catch (error) {
    // FIX: Safely handle error without accessing .value
    const errorMessage = error?.message || String(error);
    const errorStack = error?.stack || '';
    Logger.error('Failed to process Redis message', { 
      error: errorMessage,
      stack: errorStack,
      pattern, 
      channel,
      messageType: typeof message,
      messagePreview: (typeof message === 'string' ? message : message?.toString?.())?.substring(0, 200)
    });
  }
});

const subscribeToProgress = async (patterns, callback) => {
  try {
    // FIX: Store callback globally so pmessage handler can use it
    progressCallback = callback;
    Logger.info('[Progress] Callback registered for Redis messages');

    // Subscribe to all patterns
    for (const pattern of patterns) {
      await redisSubscriber.pSubscribe(pattern);
      Logger.info('[Progress] Subscribed to pattern', { pattern });
    }
    
    Logger.success('[Progress] All pattern subscriptions active', { 
      patternsCount: patterns.length,
      patterns 
    });
  } catch (error) {
    Logger.error('Failed to subscribe to progress', error, { patterns });
    throw error;
  }
};

/**
 * Unsubscribe from progress updates
 * @param {Array<string>} patterns - Channel patterns to unsubscribe from
 */
const unsubscribeFromProgress = async (patterns) => {
  try {
    for (const pattern of patterns) {
      await redisSubscriber.pUnsubscribe(pattern);
      Logger.info('[Progress] Unsubscribed from pattern', { pattern });
    }
  } catch (error) {
    Logger.error('Failed to unsubscribe from progress', error, { patterns });
  }
};

/**
 * Get current progress for a task (from cache if available)
 * Note: This is ephemeral - may not be available if task just started
 * @param {number} taskId - Task ID
 * @returns {Promise<Object|null>} - Progress data or null
 */
const getTaskProgress = async (taskId) => {
  try {
    // Check if we have cached progress in Redis
    const cacheKey = `progress:task:${taskId}`;
    const cached = await redisPublisher.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    return null;
  } catch (error) {
    Logger.error('Failed to get task progress', error, { taskId });
    return null;
  }
};

/**
 * Cache progress data (with TTL)
 * @param {number} taskId - Task ID
 * @param {Object} progressData - Progress data
 * @param {number} [ttl=3600] - TTL in seconds (default 1 hour)
 */
const cacheTaskProgress = async (taskId, progressData, ttl = 3600) => {
  try {
    const cacheKey = `progress:task:${taskId}`;
    await redisPublisher.setEx(
      cacheKey,
      ttl,
      JSON.stringify(progressData)
    );
  } catch (error) {
    Logger.error('Failed to cache task progress', error, { taskId });
  }
};

/**
 * Close Redis connections gracefully
 */
const closeConnections = async () => {
  try {
    await redisPublisher.quit();
    await redisSubscriber.quit();
    Logger.info('Redis connections closed');
  } catch (error) {
    Logger.error('Failed to close Redis connections', error);
  }
};

// Graceful shutdown
process.on('SIGTERM', closeConnections);
process.on('SIGINT', closeConnections);

module.exports = {
  publishTaskProgress,
  publishTaskStatusChange,
  publishOrderComplete,
  subscribeToProgress,
  unsubscribeFromProgress,
  getTaskProgress,
  cacheTaskProgress,
  closeConnections
};
