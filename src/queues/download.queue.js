/**
 * Download Queue Service using Redis + RQ compatibility
 * Handles Redis-based job queue for download tasks compatible with Python RQ
 * @module queues/download
 */

const redis = require('redis');
const { v4: uuidv4 } = require('crypto');
const Logger = require('../utils/logger.util');

// Redis connection configuration
const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  password: process.env.REDIS_PASSWORD || undefined,
});

// Connect to Redis
redisClient.on('error', (err) => Logger.error('Redis Client Error', err));
redisClient.on('connect', () => Logger.info('Redis Client Connected'));

// Initialize connection
(async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
})();

/**
 * Add a download job to the queue (RQ-compatible format)
 * @param {Object} jobData - Job data
 * @param {number} jobData.taskId - Download task ID from MySQL
 * @param {string} jobData.email - User email
 * @param {string} jobData.courseUrl - Course URL to download
 * @param {Object} [options] - Additional job options
 * @returns {Promise<Object>} - Job object
 */
const addDownloadJob = async (jobData, options = {}) => {
  try {
    const { taskId, email, courseUrl } = jobData;

    // Validate required fields
    if (!taskId || !email || !courseUrl) {
      throw new Error('Missing required job data: taskId, email, or courseUrl');
    }

    // Ensure Redis is connected
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }

    // Create job payload in RQ-compatible format
    const job = {
      taskId,
      email,
      courseUrl,
      timestamp: new Date().toISOString(),
      jobId: `task-${taskId}`,
    };

    // Push job to RQ queue using LPUSH (left push to queue)
    // RQ queue name format: rq:queue:downloads
    const queueKey = 'rq:queue:downloads';
    const jobJson = JSON.stringify(job);
    
    await redisClient.lPush(queueKey, jobJson);

    Logger.success('Download job added to queue', {
      jobId: job.jobId,
      taskId,
      email,
      courseUrl,
      queue: queueKey,
    });

    return job;
  } catch (error) {
    Logger.error('Failed to add download job to queue', error, {
      taskId: jobData.taskId,
      email: jobData.email,
    });
    throw error;
  }
};

/**
 * Get queue statistics
 * @returns {Promise<Object>} - Queue statistics
 */
const getQueueStats = async () => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }

    const queueKey = 'rq:queue:downloads';
    const waiting = await redisClient.lLen(queueKey);

    return {
      waiting,
      queueName: queueKey,
    };
  } catch (error) {
    Logger.error('Failed to get queue stats', error);
    throw error;
  }
};

/**
 * Get all jobs in queue
 * @returns {Promise<Array>} - Array of jobs
 */
const getAllJobs = async () => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }

    const queueKey = 'rq:queue:downloads';
    const jobs = await redisClient.lRange(queueKey, 0, -1);
    
    return jobs.map(job => JSON.parse(job));
  } catch (error) {
    Logger.error('Failed to get jobs', error);
    throw error;
  }
};

/**
 * Close queue connection gracefully
 * @returns {Promise<void>}
 */
const closeQueue = async () => {
  try {
    await redisClient.quit();
    Logger.info('Redis client closed');
  } catch (error) {
    Logger.error('Failed to close Redis client', error);
    throw error;
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  Logger.info('SIGTERM received, closing Redis client...');
  await closeQueue();
});

process.on('SIGINT', async () => {
  Logger.info('SIGINT received, closing Redis client...');
  await closeQueue();
});

module.exports = {
  redisClient,
  addDownloadJob,
  getQueueStats,
  getAllJobs,
  closeQueue,
};
