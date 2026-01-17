/**
 * Task Recovery Service
 * Auto-recovers stuck DownloadTasks when server restarts
 * Handles tasks with status 'processing' or 'enrolled' that are not in Redis queue
 * 
 * @module services/taskRecovery
 */

const { DownloadTask, Order } = require('../models');
const { addDownloadJob, getAllJobs } = require('../queues/download.queue');
const { enrollCourses } = require('./enroll.service');
const { TASK_STATUS, IN_PROGRESS_STATUSES } = require('../constants/taskStatus');
const Logger = require('../utils/logger.util');
const { Op } = require('sequelize');

/**
 * Check if a task is in Redis queue
 * @param {number} taskId - Task ID
 * @param {Array} queueJobs - Array of jobs from Redis queue
 * @returns {boolean}
 */
const isTaskInQueue = (taskId, queueJobs) => {
  return queueJobs.some(job => job.taskId === taskId);
};

/**
 * Recover stuck tasks (processing or enrolled but not in queue)
 * @param {Object} [options] - Recovery options
 * @param {boolean} [options.onlyProcessing=false] - Only recover tasks with status 'processing'
 * @param {boolean} [options.onlyEnrolled=false] - Only recover tasks with status 'enrolled'
 * @param {number} [options.maxTasks=100] - Maximum number of tasks to recover per run
 * @returns {Promise<Object>} - Recovery summary
 */
const recoverStuckTasks = async (options = {}) => {
  const {
    onlyProcessing = false,
    onlyEnrolled = false,
    maxTasks = 100
  } = options;

  try {
    Logger.info('[TaskRecovery] Starting stuck task recovery...');

    // Get all jobs currently in Redis queue
    let queueJobs = [];
    try {
      queueJobs = await getAllJobs();
      Logger.info('[TaskRecovery] Found jobs in queue', { count: queueJobs.length });
    } catch (error) {
      Logger.warn('[TaskRecovery] Failed to get queue jobs, will recover all stuck tasks', error);
      // Continue anyway - worst case we re-queue tasks that are already queued
    }

    // Build where clause to find stuck tasks
    const where = {
      // Only tasks that are in progress but potentially stuck
      status: {
        [Op.in]: IN_PROGRESS_STATUSES
      },
      // Only tasks with order_id (exclude orphaned tasks)
      order_id: {
        [Op.ne]: null
      }
    };

    // Filter by status if specified
    if (onlyProcessing) {
      where.status = TASK_STATUS.PROCESSING;
    } else if (onlyEnrolled) {
      where.status = TASK_STATUS.ENROLLED;
    }

    // Find stuck tasks (in progress but not in queue)
    // Note: DownloadTask has order_id, we'll fetch Order separately if needed
    const allStuckTasks = await DownloadTask.findAll({
      where,
      attributes: ['id', 'order_id', 'email', 'course_url', 'title', 'status', 'updated_at'],
      limit: maxTasks,
      order: [['updated_at', 'ASC']] // Oldest first
    });

    // Fetch orders for these tasks
    const orderIds = [...new Set(allStuckTasks.map(t => t.order_id).filter(Boolean))];
    const orders = orderIds.length > 0 ? await Order.findAll({
      where: { id: { [Op.in]: orderIds } },
      attributes: ['id', 'order_code', 'order_status', 'payment_status']
    }) : [];
    
    const orderMap = new Map(orders.map(o => [o.id, o]));
    
    // Attach order info to tasks
    allStuckTasks.forEach(task => {
      if (task.order_id) {
        task.order = orderMap.get(task.order_id);
      }
    });

    Logger.info('[TaskRecovery] Found potentially stuck tasks', { 
      count: allStuckTasks.length,
      statuses: onlyProcessing ? 'processing' : onlyEnrolled ? 'enrolled' : 'all'
    });

    // Filter out tasks that are actually in queue
    const stuckTasks = allStuckTasks.filter(task => {
      const inQueue = isTaskInQueue(task.id, queueJobs);
      if (inQueue) {
        Logger.debug('[TaskRecovery] Task already in queue, skipping', { taskId: task.id });
      }
      return !inQueue;
    });

    Logger.info('[TaskRecovery] Tasks confirmed stuck (not in queue)', { count: stuckTasks.length });

    if (stuckTasks.length === 0) {
      return {
        success: true,
        recovered: 0,
        failed: 0,
        skipped: 0,
        totalChecked: allStuckTasks.length,
        message: 'No stuck tasks found'
      };
    }

    // Separate tasks by status
    const processingTasks = stuckTasks.filter(t => t.status === TASK_STATUS.PROCESSING);
    const enrolledTasks = stuckTasks.filter(t => t.status === TASK_STATUS.ENROLLED);
    const pendingTasks = stuckTasks.filter(t => t.status === TASK_STATUS.PENDING);

    Logger.info('[TaskRecovery] Task breakdown', {
      processing: processingTasks.length,
      enrolled: enrolledTasks.length,
      pending: pendingTasks.length
    });

    let recoveredCount = 0;
    let failedCount = 0;
    const errors = [];

    // Step 1: Re-enroll processing tasks (need enrollment before queuing)
    for (const task of processingTasks) {
      try {
        Logger.info('[TaskRecovery] Re-enrolling processing task', {
          taskId: task.id,
          orderId: task.order_id,
          courseUrl: task.course_url
        });

        // Re-enroll the course
        const enrollResults = await enrollCourses(
          [task.course_url],
          task.email,
          task.order_id
        );

        const enrollResult = enrollResults[0];
        if (enrollResult && enrollResult.success && enrollResult.status === 'enrolled') {
          // Verify status updated in DB
          const updatedTask = await DownloadTask.findByPk(task.id);
          if (updatedTask && updatedTask.status === TASK_STATUS.ENROLLED) {
            // Add to enrolledTasks list for queuing
            enrolledTasks.push(updatedTask);
            Logger.success('[TaskRecovery] Task re-enrolled successfully', {
              taskId: task.id
            });
          } else {
            throw new Error(`Enrollment succeeded but status not updated. Expected 'enrolled', got '${updatedTask?.status}'`);
          }
        } else {
          throw new Error(enrollResult?.message || 'Enrollment failed');
        }
      } catch (error) {
        failedCount++;
        errors.push({
          taskId: task.id,
          status: 'processing',
          error: error.message
        });
        Logger.error('[TaskRecovery] Failed to re-enroll processing task', error, {
          taskId: task.id,
          orderId: task.order_id
        });
      }
    }

    // Step 2: Queue all enrolled tasks (including newly enrolled ones)
    const allEnrolledToQueue = enrolledTasks.filter((task, index, self) => 
      index === self.findIndex(t => t.id === task.id) // Remove duplicates
    );

    for (const task of allEnrolledToQueue) {
      try {
        Logger.info('[TaskRecovery] Re-queuing enrolled task', {
          taskId: task.id,
          orderId: task.order_id,
          courseUrl: task.course_url
        });

        await addDownloadJob({
          taskId: task.id,
          email: task.email,
          courseUrl: task.course_url
        });

        recoveredCount++;
        Logger.success('[TaskRecovery] Task re-queued successfully', {
          taskId: task.id
        });
      } catch (error) {
        failedCount++;
        errors.push({
          taskId: task.id,
          status: 'enrolled',
          error: error.message
        });
        Logger.error('[TaskRecovery] Failed to re-queue enrolled task', error, {
          taskId: task.id,
          orderId: task.order_id
        });
      }
    }

    // Step 3: Handle pending tasks (usually waiting for payment, but if order is paid, process them)
    for (const task of pendingTasks) {
      try {
        // Check if order is paid
        if (task.order && task.order.payment_status === 'paid') {
          Logger.info('[TaskRecovery] Processing pending task with paid order', {
            taskId: task.id,
            orderId: task.order_id
          });

          // Update status to processing
          await DownloadTask.update(
            { status: TASK_STATUS.PROCESSING },
            { where: { id: task.id } }
          );

          // Re-enroll
          const enrollResults = await enrollCourses(
            [task.course_url],
            task.email,
            task.order_id
          );

          const enrollResult = enrollResults[0];
          if (enrollResult && enrollResult.success && enrollResult.status === 'enrolled') {
            const updatedTask = await DownloadTask.findByPk(task.id);
            if (updatedTask && updatedTask.status === TASK_STATUS.ENROLLED) {
              // Queue for download
              await addDownloadJob({
                taskId: updatedTask.id,
                email: updatedTask.email,
                courseUrl: updatedTask.course_url
              });
              recoveredCount++;
              Logger.success('[TaskRecovery] Pending task processed and queued', {
                taskId: task.id
              });
            }
          }
        } else {
          Logger.debug('[TaskRecovery] Skipping pending task (order not paid yet)', {
            taskId: task.id,
            orderId: task.order_id,
            paymentStatus: task.order?.payment_status
          });
        }
      } catch (error) {
        failedCount++;
        errors.push({
          taskId: task.id,
          status: 'pending',
          error: error.message
        });
        Logger.error('[TaskRecovery] Failed to process pending task', error, {
          taskId: task.id
        });
      }
    }

    const summary = {
      success: true,
      recovered: recoveredCount,
      failed: failedCount,
      skipped: allStuckTasks.length - stuckTasks.length,
      totalChecked: allStuckTasks.length,
      totalStuck: stuckTasks.length,
      breakdown: {
        processing: processingTasks.length,
        enrolled: enrolledTasks.length,
        pending: pendingTasks.length
      },
      errors: errors.length > 0 ? errors : undefined,
      message: `Recovered ${recoveredCount} task(s), ${failedCount} failed, ${allStuckTasks.length - stuckTasks.length} already in queue`
    };

    Logger.info('[TaskRecovery] Recovery completed', summary);

    return summary;
  } catch (error) {
    Logger.error('[TaskRecovery] Recovery failed', error);
    throw error;
  }
};

/**
 * Recover stuck tasks for a specific order
 * @param {number} orderId - Order ID
 * @returns {Promise<Object>} - Recovery summary
 */
const recoverOrderTasks = async (orderId) => {
  try {
    Logger.info('[TaskRecovery] Recovering tasks for order', { orderId });

    // Get order with tasks
    const order = await Order.findByPk(orderId, {
      include: [
        {
          model: DownloadTask,
          as: 'tasks',
          where: {
            status: {
              [Op.in]: IN_PROGRESS_STATUSES
            }
          },
          required: false
        }
      ]
    });

    if (!order) {
      throw new Error('Order not found');
    }

    if (!order.tasks || order.tasks.length === 0) {
      return {
        success: true,
        orderId,
        recovered: 0,
        message: 'No stuck tasks found for this order'
      };
    }

    // Get queue jobs
    const queueJobs = await getAllJobs();

    // Filter stuck tasks
    const stuckTasks = order.tasks.filter(task => 
      !isTaskInQueue(task.id, queueJobs)
    );

    if (stuckTasks.length === 0) {
      return {
        success: true,
        orderId,
        recovered: 0,
        message: 'All tasks already in queue'
      };
    }

    // Process similar to recoverStuckTasks but only for this order
    const processingTasks = stuckTasks.filter(t => t.status === TASK_STATUS.PROCESSING);
    const enrolledTasks = stuckTasks.filter(t => t.status === TASK_STATUS.ENROLLED);

    let recoveredCount = 0;
    let failedCount = 0;

    // Re-enroll processing tasks
    for (const task of processingTasks) {
      try {
        const enrollResults = await enrollCourses(
          [task.course_url],
          task.email,
          orderId
        );

        const enrollResult = enrollResults[0];
        if (enrollResult && enrollResult.success && enrollResult.status === 'enrolled') {
          const updatedTask = await DownloadTask.findByPk(task.id);
          if (updatedTask && updatedTask.status === TASK_STATUS.ENROLLED) {
            enrolledTasks.push(updatedTask);
          }
        }
      } catch (error) {
        failedCount++;
        Logger.error('[TaskRecovery] Failed to re-enroll task', error, { taskId: task.id });
      }
    }

    // Queue enrolled tasks
    const allEnrolledToQueue = enrolledTasks.filter((task, index, self) => 
      index === self.findIndex(t => t.id === task.id)
    );

    for (const task of allEnrolledToQueue) {
      try {
        await addDownloadJob({
          taskId: task.id,
          email: task.email,
          courseUrl: task.course_url
        });
        recoveredCount++;
      } catch (error) {
        failedCount++;
        Logger.error('[TaskRecovery] Failed to queue task', error, { taskId: task.id });
      }
    }

    return {
      success: true,
      orderId,
      recovered: recoveredCount,
      failed: failedCount,
      totalStuck: stuckTasks.length
    };
  } catch (error) {
    Logger.error('[TaskRecovery] Failed to recover order tasks', error, { orderId });
    throw error;
  }
};

module.exports = {
  recoverStuckTasks,
  recoverOrderTasks
};
