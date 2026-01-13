/**
 * Webhook service for handling webhook-related business logic
 * @module services/webhook
 */

const DownloadTask = require('../models/downloadTask.model');
const Order = require('../models/order.model');
const { findFolderByName, grantReadAccess } = require('../utils/drive.util');
const { sendBatchCompletionEmail } = require('./email.service');
const Logger = require('../utils/logger.util');
const { AppError } = require('../middleware/errorHandler.middleware');

const MAX_RETRY_ATTEMPTS = 10;
const RETRY_DELAY_MS = 3000;

// Task statuses that indicate the task is still in progress
// Removed 'paid' as it's redundant - tasks are created as 'pending' now
const IN_PROGRESS_STATUSES = ['pending', 'processing', 'enrolled'];

/**
 * Waits for a specified duration
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Finds a folder on Google Drive with retry logic
 * @param {string} folderName - Name of the folder to find
 * @returns {Promise<Object|null>} - Folder object or null if not found
 */
const findFolderWithRetry = async (folderName) => {
  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const folder = await findFolderByName(folderName);
      if (folder) {
        return folder;
      }
    } catch (error) {
      Logger.warn('Error finding folder', { folderName, attempt: attempt + 1, error: error.message });
    }

    if (attempt < MAX_RETRY_ATTEMPTS - 1) {
      await wait(RETRY_DELAY_MS);
    }
  }

  return null;
};

/**
 * Grants read access to a Google Drive folder
 * @param {string} folderId - Google Drive folder ID
 * @param {string} email - Email to grant access to
 * @returns {Promise<boolean>} - True if successful
 */
const grantFolderAccess = async (folderId, email) => {
  try {
    await grantReadAccess(folderId, email);
    Logger.success('Folder access granted', { folderId, email });
    return true;
  } catch (error) {
    Logger.error('Failed to grant folder access', error, { folderId, email });
    return false;
  }
};

/**
 * Checks if all tasks in an order are completed (no tasks in progress)
 * @param {number} orderId - Order ID
 * @returns {Promise<Object>} - Object containing completion status and tasks
 */
const checkOrderCompletion = async (orderId) => {
  if (!orderId) {
    Logger.warn('No order_id provided for completion check');
    return { isComplete: false, tasks: [] };
  }

  // Query all tasks belonging to this order
  const allTasks = await DownloadTask.findAll({
    where: { order_id: orderId },
    attributes: ['id', 'status', 'drive_link', 'title', 'course_url', 'email'],
    raw: true
  });

  if (allTasks.length === 0) {
    Logger.warn('No tasks found for order', { orderId });
    return { isComplete: false, tasks: [] };
  }

  // Check if any tasks are still in progress
  const inProgressTasks = allTasks.filter(task => 
    IN_PROGRESS_STATUSES.includes(task.status)
  );

  const isComplete = inProgressTasks.length === 0;

  Logger.info('[Order Check] Task status summary', {
    orderId,
    totalTasks: allTasks.length,
    inProgress: inProgressTasks.length,
    isComplete
  });

  return {
    isComplete,
    tasks: allTasks,
    inProgressCount: inProgressTasks.length
  };
};

/**
 * Sends batch notification email for completed order
 * @param {number} orderId - Order ID
 * @param {Array} tasks - All tasks in the order
 * @returns {Promise<void>}
 */
const sendOrderCompletionNotification = async (orderId, tasks) => {
  try {
    // Fetch order details
    const order = await Order.findByPk(orderId, {
      attributes: ['id', 'order_code', 'user_email', 'total_amount'],
      raw: true
    });

    if (!order) {
      Logger.error('Order not found for batch email', { orderId });
      return;
    }

    Logger.info('[Batch Email] Sending order completion notification', {
      orderId: order.id,
      orderCode: order.order_code,
      taskCount: tasks.length
    });

    await sendBatchCompletionEmail(order, tasks);

  } catch (error) {
    Logger.error('[Batch Email] Failed to send order completion notification', error, {
      orderId,
      taskCount: tasks.length
    });
    // Don't throw - order is already processed
  }
};

/**
 * Finalizes a download task with batch notification logic
 * @param {number} taskId - Task ID
 * @param {string} folderName - Folder name on Google Drive
 * @param {string} secretKey - Secret key for authentication
 * @returns {Promise<Object>} - Finalization result
 * @throws {AppError} - If validation fails
 */
const finalizeDownload = async (taskId, folderName, secretKey) => {
  // Validate secret key
  const SERVER_SECRET = process.env.API_SECRET_KEY;
  if (!SERVER_SECRET) {
    throw new AppError('Server secret key not configured', 500);
  }

  if (secretKey !== SERVER_SECRET) {
    throw new AppError('Forbidden: Wrong Key', 403);
  }

  // Find task with order_id
  const task = await DownloadTask.findByPk(taskId, {
    attributes: ['id', 'email', 'course_url', 'title', 'status', 'drive_link', 'order_id']
  });

  if (!task) {
    throw new AppError('Task not found', 404);
  }

  Logger.info('[Webhook] Finalizing download task', { 
    taskId, 
    orderId: task.order_id,
    folderName 
  });

  // ===== STEP 1: Find folder on Drive with retry =====
  const driveFolder = await findFolderWithRetry(folderName);
  let driveLink = null;

  if (driveFolder) {
    driveLink = driveFolder.webViewLink;
    Logger.success('[Webhook] Drive folder found', { 
      folderId: driveFolder.id,
      taskId 
    });

    // Grant access to user
    await grantFolderAccess(driveFolder.id, task.email);
  } else {
    Logger.warn('[Webhook] Drive folder not found after retries', { 
      folderName, 
      taskId 
    });
  }

  // ===== STEP 2: Update current task with STRICT validation =====
  // Task is 'completed' ONLY if we have a valid drive_link
  // Task is 'failed' if no drive_link (even if folder was expected)
  const updateData = {
    status: driveLink ? 'completed' : 'failed',
    drive_link: driveLink
  };

  await task.update(updateData);

  Logger.info('[Webhook] Task updated', {
    taskId,
    status: updateData.status,
    hasDriveLink: !!driveLink
  });

  // ===== STEP 3: Check Order Completion & Update Order Status =====
  const orderId = task.order_id;
  
  if (orderId) {
    const { isComplete, tasks, inProgressCount } = await checkOrderCompletion(orderId);

    if (isComplete) {
      // All tasks are done - update Order status and send batch notification
      Logger.info('[Order Completion] Order #' + orderId + ': All tasks finished. Updating order status...', {
        orderId,
        totalTasks: tasks.length,
        successfulTasks: tasks.filter(t => t.status === 'completed' && t.drive_link).length
      });

      // Update Order status to 'completed'
      // Use atomic update to prevent race conditions
      const order = await Order.findByPk(orderId);
      if (order) {
        // Determine final order status based on task results
        const allTasksSuccessful = tasks.every(t => t.status === 'completed' && t.drive_link);
        const finalOrderStatus = allTasksSuccessful ? 'completed' : 'completed'; // completed with some failures
        
        await order.update({ 
          order_status: finalOrderStatus 
        });

        Logger.success('[Order Status] Order updated to COMPLETED', {
          orderId: order.id,
          orderCode: order.order_code,
          orderStatus: finalOrderStatus,
          allSuccess: allTasksSuccessful
        });
      }

      // Send batch completion notification
      await sendOrderCompletionNotification(orderId, tasks);
    } else {
      // Still have tasks in progress - wait
      Logger.info('[Order Status] Order #' + orderId + ': Waiting for other tasks to complete', {
        orderId,
        inProgressCount,
        totalTasks: tasks.length
      });
    }
  } else {
    Logger.warn('[Webhook] Task has no order_id - skipping batch notification', { taskId });
  }

  return {
    success: true,
    taskId,
    driveLink: driveLink || null,
    status: updateData.status
  };
};

module.exports = {
  finalizeDownload,
  checkOrderCompletion
};
