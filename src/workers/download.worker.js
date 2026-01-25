/**
 * Download worker for processing download tasks
 * @module workers/download
 */

const enrollService = require('../services/enroll.service');
const emailService = require('../services/email.service');
const DownloadTask = require('../models/downloadTask.model');
const { Order } = require('../models');
const Logger = require('../utils/logger.util');

/**
 * Processes a download task
 * @param {Object} task - Download task object
 * @returns {Promise<void>}
 */
exports.processTask = async (task) => {
  // Validate task parameter
  if (!task) {
    throw new Error('Task parameter is required but was not provided');
  }
  
  if (!task.id) {
    throw new Error('Task ID is required but was not found in task object');
  }

  // Always reload task from database to ensure we have all fields including email
  // bulkCreate might not return all fields, so we reload to be safe
  let taskWithEmail;
  
  try {
    taskWithEmail = await DownloadTask.findByPk(task.id, {
      attributes: ['id', 'email', 'course_url', 'status', 'order_id', 'phone_number', 'course_type']
    });
    
    if (!taskWithEmail) {
      throw new Error(`Task ${task.id} not found in database`);
    }
    
    if (!taskWithEmail.email) {
      Logger.error('Task missing email field', { taskId: task.id, taskData: task });
      throw new Error(`Task ${task.id} does not have email field. Email is required for enrollment.`);
    }
    
    if (!taskWithEmail.course_url) {
      Logger.error('Task missing course_url field', { taskId: task.id });
      throw new Error(`Task ${task.id} does not have course_url field`);
    }
  } catch (error) {
    Logger.error('Failed to reload task from database', error, {
      taskId: task.id,
      originalTask: task
    });
    throw error;
  }

  Logger.info('Starting task processing', {
    taskId: taskWithEmail.id,
    courseUrl: taskWithEmail.course_url,
    email: taskWithEmail.email,
    status: taskWithEmail.status
  });

  // Check if task status is 'processing' (tasks with status 'pending' should not be processed yet)
  // Status flow: 'pending' -> 'processing' (after payment) -> 'enrolled' -> 'completed'
  if (taskWithEmail.status !== 'processing') {
    Logger.info('Task status is not processing, skipping', {
      taskId: taskWithEmail.id,
      status: taskWithEmail.status,
      message: 'Task will be processed when status changes to processing after payment confirmation'
    });
    return;
  }

  // Check if order is paid (if task has order_id)
  if (taskWithEmail.order_id) {
    try {
      const order = await Order.findByPk(taskWithEmail.order_id, {
        attributes: ['id', 'payment_status', 'order_code']
      });

      if (order) {
        if (order.payment_status !== 'paid') {
          Logger.info('Order not paid yet, skipping task processing', {
            taskId: taskWithEmail.id,
            orderId: order.id,
            orderCode: order.order_code,
            paymentStatus: order.payment_status
          });
          // Don't throw error, just skip processing
          // Task will be processed later when payment is completed
          return;
        }

        Logger.debug('Order payment verified', {
          taskId: taskWithEmail.id,
          orderId: order.id,
          orderCode: order.order_code,
          paymentStatus: order.payment_status
        });
      }
    } catch (orderError) {
      Logger.warn('Failed to check order payment status', orderError, {
        taskId: taskWithEmail.id,
        orderId: taskWithEmail.order_id
      });
      // Continue processing if order check fails (for backward compatibility)
    }
  }

  try {
    // Step 1: Enroll in course if it's a Udemy course
    if (taskWithEmail.course_url && taskWithEmail.course_url.includes('udemy.com')) {
      if (!taskWithEmail.email) {
        throw new Error('Email is required for enrollment but not found in task');
      }

      // Pass orderId if available (null for permanent downloads)
      const enrollResults = await enrollService.enrollCourses(
        [taskWithEmail.course_url],
        taskWithEmail.email,
        taskWithEmail.order_id || null
      );
      const result = enrollResults[0];

      // ✅ CRITICAL: Enrollment MUST succeed before download
      // No exceptions - both admin and regular downloads require successful enrollment
      if (!result || !result.success || result.status !== 'enrolled') {
        const errorMessage = result ? result.message : 'Unknown error';
        Logger.error('Enrollment failed - download cannot proceed', {
          taskId: taskWithEmail.id,
          error: errorMessage,
          status: result ? result.status : 'unknown',
          courseType: taskWithEmail.course_type,
          orderId: taskWithEmail.order_id
        });
        throw new Error(`Enroll thất bại: ${errorMessage}`);
      }

      Logger.success('Enrollment successful', {
        taskId: taskWithEmail.id,
        courseId: result.courseId,
        title: result.title
      });
    }

    // Step 2: Update task status to enrolled (only if enrollment succeeded)
    // ✅ CRITICAL: Only update to 'enrolled' if enrollment actually succeeded
    await DownloadTask.update(
      { status: 'enrolled' },
      {
        where: { id: taskWithEmail.id },
        fields: ['status']
      }
    );

    Logger.success('Task processing completed', { taskId: taskWithEmail.id });
  } catch (error) {
    // Safely get task ID and other properties
    const taskId = taskWithEmail?.id || null;
    const courseUrl = taskWithEmail?.course_url || null;
    const email = taskWithEmail?.email || null;

    Logger.error('Task processing failed', error, {
      taskId: taskId,
      courseUrl: courseUrl,
      email: email
    });

    // ✅ CRITICAL: Update task status to failed for ALL downloads (including admin)
    // Enrollment must succeed before download - no exceptions
    if (taskId) {
      try {
        await DownloadTask.update(
          {
            status: 'failed',
            error_log: error.message
          },
          {
            where: { id: taskId },
            fields: ['status', 'error_log']
          }
        );
      } catch (updateError) {
        Logger.error('Failed to update task status', updateError, { taskId });
      }
    }

    // Send error alert email (only if we have task data)
    if (taskWithEmail) {
      try {
        await emailService.sendErrorAlert(taskWithEmail, error.message);
      } catch (emailError) {
        Logger.error('Failed to send error alert email', emailError, { taskId });
      }
    }
  }
};