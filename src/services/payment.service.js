/**
 * Payment service for handling payment-related business logic
 * @module services/payment
 */

const { Order, DownloadTask } = require('../models');
const sequelize = require('../config/database');
const downloadService = require('./download.service');
const infoCourseService = require('./infoCourse.service');
const enrollService = require('./enroll.service');
const { generateVietQR } = require('../utils/qrGenerator');
const Logger = require('../utils/logger.util');
const lifecycleLogger = require('./lifecycleLogger.service');
const { AppError } = require('../middleware/errorHandler.middleware');
const { addDownloadJob } = require('../queues/download.queue');
const { calculateOrderPrice, getComboUnitPrice, pricingConfig } = require('../utils/pricing.util');
const { sendPaymentSuccessEmail } = require('./email.service');

/**
 * Generates a sequential order code based on order ID
 * Format: DH + 6 digits (e.g., DH000001, DH000002)
 * @param {number} orderId - Auto-incremented order ID from database
 * @returns {string} - Sequential order code
 */
const generateOrderCode = (orderId) => {
  // Sequential order code: DH + 6 digits (padded with zeros)
  // Example: ID 1 -> DH000001, ID 100 -> DH000100
  const sequence = String(orderId).padStart(6, '0');
  return `DH${sequence}`;
};

/**
 * Creates a new order
 * @param {string} email - Customer email
 * @param {Array} courses - Array of course objects with url, title, price, courseId properties
 * @returns {Promise<Object>} - Created order with orderCode, QR code, courses, and download tasks
 * @throws {AppError} - If validation fails or creation fails
 */
const createOrder = async (email, courses) => {
  try {
    // Validate input
    if (!email || !courses || !Array.isArray(courses) || courses.length === 0) {
      throw new AppError('Email và danh sách khóa học là bắt buộc', 400);
    }

    // Filter valid courses and calculate total price using pricing utility
    const { validCourses, validCount, totalPrice } = calculateOrderPrice(courses);

    if (validCourses.length === 0) {
      throw new AppError('Không có khóa học hợp lệ', 400);
    }

    // Use calculated total price
    const totalAmount = totalPrice;

    // Check if combo applies and calculate unit price
    const comboUnitPrice = getComboUnitPrice(validCount, totalAmount);
    
    if (comboUnitPrice !== null) {
      const comboType = validCount === 5 ? 'Combo 5' : validCount === 10 ? 'Combo 10' : 'Unknown';
      Logger.info(`${comboType} order detected`, {
        totalPrice: totalAmount,
        unitPrice: comboUnitPrice,
        courseCount: validCount
      });
    }

    // Create order in database WITHOUT order_code first
    // This allows us to get the auto-incremented ID
    const order = await Order.create({
      order_code: 'TEMP', // Temporary placeholder
      user_email: email,
      total_amount: totalAmount,
      payment_status: 'pending' // Order is created as pending, waiting for payment confirmation
    });

    // Generate sequential order code using the auto-incremented ID
    const orderCode = generateOrderCode(order.id);
    
    // Update order with the sequential order code
    await order.update({ order_code: orderCode });

    Logger.success('Order created', {
      orderId: order.id,
      orderCode: order.order_code,
      email: order.user_email,
      totalAmount: order.total_amount,
      isCombo: comboUnitPrice !== null,
      comboType: validCount === 5 ? 'Combo 5' : validCount === 10 ? 'Combo 10' : null
    });

    // ✅ LIFECYCLE LOG: Order Creation with validation details
    try {
      // Get validation results from infoCourse service
      const validationResults = await infoCourseService.getCourseInfo(validCourses.map(c => c.url));
      const successCount = validationResults.filter(r => r.success).length;
      const failedUrls = validationResults.filter(r => !r.success).map(r => r.url);
      
      lifecycleLogger.logOrderCreated(
        order.id,
        email,
        totalAmount,
        order.payment_status,
        {
          successCount,
          totalCount: validCourses.length,
          failedUrls
        }
      );
    } catch (validationError) {
      // Log validation error but don't fail order creation
      Logger.warn('Failed to get validation details for lifecycle log', { orderId: order.id });
      lifecycleLogger.logOrderCreated(
        order.id,
        email,
        totalAmount,
        order.payment_status,
        {
          successCount: validCourses.length,
          totalCount: validCourses.length,
          failedUrls: []
        }
      );
    }

    // Create download tasks for this order
    let downloadTasks = [];
    try {
      const tasksResult = await downloadService.createDownloadTasks(
        order.id,
        email,
        validCourses,
        null // phoneNumber - optional
      );
      downloadTasks = tasksResult.tasks || [];
      
      Logger.success('Download tasks created for order', {
        orderId: order.id,
        taskCount: downloadTasks.length
      });

      // If combo applies, update all task prices to the calculated unit price
      if (comboUnitPrice !== null && downloadTasks.length > 0) {
        try {
          const taskIds = downloadTasks.map(task => task.id);
          const comboType = validCount === 5 ? 'Combo 5' : validCount === 10 ? 'Combo 10' : 'Unknown';
          
          await DownloadTask.update(
            { price: comboUnitPrice },
            {
              where: {
                id: taskIds,
                order_id: order.id
              }
            }
          );

          Logger.success(`Updated ${comboType} task prices`, {
            orderId: order.id,
            taskCount: taskIds.length,
            unitPrice: comboUnitPrice,
            totalPrice: totalAmount
          });

          // Refresh tasks to get updated prices
          downloadTasks = await DownloadTask.findAll({
            where: {
              id: taskIds,
              order_id: order.id
            }
          });
        } catch (priceUpdateError) {
          // Log error but don't fail - order and tasks are already created
          Logger.error('Failed to update combo task prices', priceUpdateError, {
            orderId: order.id,
            unitPrice: comboUnitPrice,
            comboType: validCount === 5 ? 'Combo 5' : validCount === 10 ? 'Combo 10' : 'Unknown'
          });
        }
      }
    } catch (taskError) {
      // Log error but don't fail the order creation
      // Tasks can be created later via webhook or manual process
      Logger.error('Failed to create download tasks for order', taskError, {
        orderId: order.id,
        email
      });
      // Continue without throwing - order is already created
    }

    // Generate QR code URL
    const qrCodeUrl = generateVietQR(totalAmount, orderCode);

    // Format courses info for response (ensure all have price)
    // For combo orders, use the calculated unit price
    const unitPriceForResponse = comboUnitPrice !== null 
      ? comboUnitPrice 
      : pricingConfig.PRICE_PER_COURSE;
    
    const coursesInfo = validCourses.map(course => ({
      url: course.url,
      title: course.title || null,
      price: comboUnitPrice !== null 
        ? comboUnitPrice 
        : (course.price !== undefined && course.price !== null ? parseFloat(course.price) : pricingConfig.PRICE_PER_COURSE),
      courseId: course.courseId || null
    }));

    // Return complete order info (without downloadTasks)
    return {
      orderId: order.id,
      orderCode: order.order_code,
      totalAmount: order.total_amount,
      paymentStatus: order.payment_status,
      qrCodeUrl: qrCodeUrl,
      courses: coursesInfo
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    Logger.error('Failed to create order', error, { email, coursesCount: courses?.length });
    throw new AppError('Lỗi server nội bộ khi tạo đơn hàng', 500);
  }
};

/**
 * Processes payment webhook from SePay payment gateway
 * Uses transaction to ensure data consistency
 * @param {string} orderCode - Order code (e.g., "DH34575")
 * @param {number} transferAmount - Transfer amount
 * @param {Object} webhookData - Full webhook data (gateway, transactionDate, referenceCode, etc.)
 * @returns {Promise<Object>} - Processing result
 * @throws {AppError} - If processing fails
 */
const processPaymentWebhook = async (orderCode, transferAmount, webhookData) => {
  const sequelize = require('../config/database');
  const DownloadTask = require('../models/downloadTask.model');
  const downloadService = require('./download.service');
  
  const transaction = await sequelize.transaction();
  
  try {
    Logger.info('Processing SePay webhook', {
      orderCode,
      transferAmount,
      gateway: webhookData?.gateway,
      transactionDate: webhookData?.transactionDate,
      referenceCode: webhookData?.referenceCode,
      timestamp: new Date().toISOString()
    });

    // Normalize order code to uppercase
    const normalizedOrderCode = orderCode.toUpperCase();

    // Find order by order code (lock for update within transaction)
    const order = await Order.findOne({
      where: { order_code: normalizedOrderCode },
      attributes: ['id', 'order_code', 'user_email', 'total_amount', 'payment_status'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!order) {
      Logger.warn('Order not found', { orderCode: normalizedOrderCode });
      await transaction.rollback();
      // Return success to stop SePay retries for non-existent orders
      return { success: true, message: 'Không tìm thấy đơn hàng' };
    }

    Logger.info('Order found', {
      orderId: order.id,
      orderCode: order.order_code,
      currentStatus: order.payment_status,
      expectedAmount: order.total_amount
    });

    // Check if already paid - return success immediately to stop retries
    if (order.payment_status === 'paid') {
      Logger.info('Order already paid, skipping processing', { 
        orderCode: normalizedOrderCode, 
        orderId: order.id 
      });
      await transaction.rollback();
      return { 
        success: true, 
        message: 'Already paid',
        orderId: order.id,
        orderCode: order.order_code,
        paymentStatus: 'paid'
      };
    }

    // Validate amount - transferAmount should be >= order.total_amount
    const expectedAmount = parseFloat(order.total_amount);
    const receivedAmount = parseFloat(transferAmount);
    const amountDifference = expectedAmount - receivedAmount;
    const AMOUNT_TOLERANCE = 1000; // Allow 1000 VND difference for rounding

    if (amountDifference > AMOUNT_TOLERANCE) {
      Logger.warn('Amount mismatch - insufficient payment', {
        orderCode: normalizedOrderCode,
        expected: expectedAmount,
        received: receivedAmount,
        difference: amountDifference,
        tolerance: AMOUNT_TOLERANCE
      });
      await transaction.rollback();
      // Return success but log warning - don't process payment
      return { 
        success: true, 
        message: 'Số tiền thanh toán không đủ',
        expectedAmount,
        receivedAmount
      };
    }

    Logger.info('Amount validated', {
      expected: expectedAmount,
      received: receivedAmount,
      difference: amountDifference
    });

    // Prepare payment gateway data with specific fields
    const paymentGatewayData = {
      gateway: webhookData?.gateway || null,
      transactionDate: webhookData?.transactionDate || null,
      referenceCode: webhookData?.referenceCode || null,
      accountNumber: webhookData?.accountNumber || null,
      transferType: webhookData?.transferType || null,
      code: webhookData?.code || null,
      content: webhookData?.content || null,
      transferAmount: receivedAmount,
      fullPayload: webhookData // Store full payload for debugging
    };

    // Transaction: Update Order.payment_status to 'paid' AND order_status to 'processing'
    await order.update({
      payment_status: 'paid',
      order_status: 'processing', // Mark order as being processed
      payment_gateway_data: paymentGatewayData
    }, { transaction });

    // Update download tasks status to 'processing'
    // Only update tasks that are in 'pending' status (waiting for payment)
    const [updatedCount] = await DownloadTask.update(
      { status: 'processing' },
      {
        where: {
          order_id: order.id,
          status: 'pending' // ✅ FIXED: Only update pending tasks (not 'paid' anymore)
        },
        transaction
      }
    );

    Logger.info('Transaction updates', {
      orderStatus: 'paid',
      tasksUpdated: updatedCount
    });

    // Commit transaction
    await transaction.commit();

    Logger.success('Order payment processed successfully', {
      orderId: order.id,
      orderCode: order.order_code,
      amount: receivedAmount,
      tasksUpdated: updatedCount
    });

    // ✅ LIFECYCLE LOG: Payment Received
    lifecycleLogger.logPaymentReceived(
      order.id,
      receivedAmount,
      webhookData?.gateway || 'SePay'
    );

    // ✅ SEND PAYMENT SUCCESS EMAIL
    try {
      await sendPaymentSuccessEmail({
        id: order.id,
        order_code: order.order_code,
        user_email: order.user_email,
        total_amount: order.total_amount
      });
    } catch (emailError) {
      // Log error but don't fail webhook - payment is already confirmed
      Logger.error('Failed to send payment success email', emailError, {
        orderId: order.id,
        orderCode: order.order_code,
        impact: 'Payment confirmed but email notification failed'
      });
    }

    // ================================================================
    // PHASE 2: ENROLL COURSES THEN PUSH JOBS TO REDIS QUEUE
    // ================================================================
    // After transaction is committed and payment is confirmed:
    // 1. ENROLL all courses first (required before download)
    // 2. Push jobs to Redis queue for download
    //
    // IMPORTANT: If enrollment or queue push fails, we DON'T revert payment because:
    // 1. Payment is already confirmed and committed to database
    // 2. Customer has already paid - reverting would cause data inconsistency
    // 3. Failed tasks can be manually re-enrolled/re-queued later using admin tools
    // 4. Database status tracks enrollment/queue state for recovery
    //
    // Failure scenarios and recovery:
    // - Enrollment fails: Task status stays 'processing', can retry enrollment manually
    // - Redis down: Jobs stay in DB as 'enrolled', can be re-queued manually
    // - Worker down: Jobs queue up in Redis, workers process when back online
    // ================================================================
    
    if (updatedCount > 0) {
      try {
        // Fetch all tasks that were just updated to 'processing'
        const tasks = await DownloadTask.findAll({
          where: {
            order_id: order.id,
            status: 'processing'
          },
          attributes: ['id', 'email', 'course_url', 'title']
        });

        Logger.info('Starting enrollment and queue push', {
          orderId: order.id,
          taskCount: tasks.length,
          workflow: 'Enroll → Queue → Download'
        });

        // ================================================================
        // STEP 1: ENROLL ALL COURSES
        // ================================================================
        let enrolledCount = 0;
        let enrollFailedCount = 0;
        const enrolledTasks = [];
        
        for (const task of tasks) {
          try {
            Logger.info('Enrolling course', {
              taskId: task.id,
              courseUrl: task.course_url,
              email: task.email
            });

            // ✅ FIX: Pass order_id to enrollment service to find correct task
            // Call enrollment service with order_id to ensure we enroll the correct task
            const enrollResults = await enrollService.enrollCourses(
              [task.course_url],
              task.email,
              order.id // Pass order_id to find correct task
            );

            // Check enrollment result
            const enrollResult = enrollResults[0];
            if (enrollResult && enrollResult.success && enrollResult.status === 'enrolled') {
              // ✅ FIX: Verify status is actually updated in DB before pushing to queue
              // This prevents race condition where worker checks status before DB commit
              let isStatusVerified = false;
              let retryCount = 0;
              const maxRetries = 10; // 10 retries = 5 seconds max wait
              
              while (retryCount < maxRetries && !isStatusVerified) {
                const taskInDb = await DownloadTask.findByPk(task.id, {
                  attributes: ['id', 'status']
                });
                
                if (taskInDb && taskInDb.status === 'enrolled') {
                  isStatusVerified = true;
                  break;
                }
                
                // Wait 500ms before retry
                await new Promise(resolve => setTimeout(resolve, 500));
                retryCount++;
              }
              
              if (isStatusVerified) {
                enrolledCount++;
                enrolledTasks.push(task);
                
                Logger.success('Course enrolled successfully', {
                  taskId: task.id,
                  courseId: enrollResult.courseId,
                  title: enrollResult.title,
                  email: task.email,
                  verificationRetries: retryCount
                });

                // ✅ FIX: LIFECYCLE LOG - Only log after DB verification
                // NOTE: enroll.service.js already logs ENROLL_SUCCESS, so we skip here to avoid duplicate
                // Only log if enrollment service didn't log (edge case)
                const finalTaskCheck = await DownloadTask.findByPk(task.id, {
                  attributes: ['id', 'status', 'order_id']
                });
                
                // Skip logging here - enroll.service.js already logs it
                // This prevents duplicate ENROLL_SUCCESS logs
                Logger.debug('Enrollment verified in payment service', {
                  taskId: task.id,
                  status: finalTaskCheck?.status,
                  orderId: order.id
                });
              } else {
                enrollFailedCount++;
                
                const taskInDb = await DownloadTask.findByPk(task.id, {
                  attributes: ['id', 'status']
                });
                
                Logger.error('Enrollment status verification failed', new Error('Status not updated in DB'), {
                  taskId: task.id,
                  expectedStatus: 'enrolled',
                  actualStatus: taskInDb?.status || 'unknown',
                  retries: retryCount,
                  recovery: 'Task can be manually re-enrolled using enrollment API'
                });
              }
            } else {
              enrollFailedCount++;
              
              Logger.error('Course enrollment failed', new Error(enrollResult?.message || 'Unknown error'), {
                taskId: task.id,
                courseUrl: task.course_url,
                email: task.email,
                enrollResult: enrollResult,
                recovery: 'Task can be manually re-enrolled using enrollment API'
              });
            }
          } catch (enrollError) {
            enrollFailedCount++;
            
            Logger.error('Exception during course enrollment', enrollError, {
              taskId: task.id,
              courseUrl: task.course_url,
              email: task.email,
              recovery: 'Task can be manually re-enrolled using enrollment API'
            });
          }
        }
        
        Logger.info('Enrollment summary', {
          orderId: order.id,
          total: tasks.length,
          enrolled: enrolledCount,
          failed: enrollFailedCount
        });

        // ================================================================
        // STEP 2: PUSH ENROLLED TASKS TO REDIS QUEUE
        // ================================================================
        if (enrolledTasks.length > 0) {
          Logger.info('Pushing enrolled tasks to Redis queue', {
            orderId: order.id,
            enrolledTaskCount: enrolledTasks.length
          });

          let queueSuccessCount = 0;
          let queueFailCount = 0;
          
          for (const task of enrolledTasks) {
            try {
              await addDownloadJob({
                taskId: task.id,
                email: task.email,
                courseUrl: task.course_url
              });

              queueSuccessCount++;
              
              Logger.success('Task pushed to Redis queue', {
                taskId: task.id,
                orderId: order.id,
                email: task.email
              });
            } catch (queueError) {
              queueFailCount++;
              
              // Log error but continue with other tasks
              // Task remains in DB with status='enrolled' for manual recovery
              Logger.error('Failed to push task to Redis queue', queueError, {
                taskId: task.id,
                orderId: order.id,
                email: task.email,
                recovery: 'Task can be manually re-queued using: node scripts/requeue-task.js ' + task.id
              });
            }
          }
          
          Logger.info('Queue push summary', {
            orderId: order.id,
            enrolled: enrolledTasks.length,
            queued: queueSuccessCount,
            queueFailed: queueFailCount
          });
        } else {
          Logger.warn('No tasks enrolled successfully, skipping queue push', {
            orderId: order.id,
            totalTasks: tasks.length,
            enrollFailed: enrollFailedCount
          });
        }
        
      } catch (processError) {
        // Log error but don't fail webhook - payment is already confirmed
        // Customer has paid, so we must not return an error to payment gateway
        Logger.error('Failed to enroll courses or push tasks to queue after payment', processError, {
          orderId: order.id,
          impact: 'Payment confirmed but enrollment/downloads not started',
          recovery: 'Use admin panel to re-enroll and re-queue all tasks for this order'
        });
      }
    }

    return {
      success: true,
      orderId: order.id,
      orderCode: order.order_code,
      paymentStatus: 'paid',
      tasksUpdated: updatedCount
    };
  } catch (error) {
    // Rollback transaction on error
    await transaction.rollback();
    
    if (error instanceof AppError) {
      throw error;
    }
    
    Logger.error('Failed to process payment webhook', error, {
      orderCode,
      transferAmount,
      stack: error.stack
    });
    
    // Return success to prevent SePay from retrying indefinitely
    // But log the error for manual investigation
    return { 
      success: true, 
      message: 'Lỗi xử lý webhook (đã ghi log)',
      error: error.message 
    };
  }
};

/**
 * Gets order status by order code
 * @param {string} orderCode - Order code (e.g., "DH000004")
 * @returns {Promise<Object|null>} - Order status object or null if not found
 * @throws {AppError} - If query fails
 */
const getOrderStatus = async (orderCode) => {
  try {
    if (!orderCode) {
      throw new AppError('Mã đơn hàng là bắt buộc', 400);
    }

    const order = await Order.findOne({
      where: { order_code: orderCode },
      attributes: ['id', 'order_code', 'user_email', 'total_amount', 'payment_status', 'order_status', 'created_at', 'updated_at']
    });

    if (!order) {
      return null;
    }

    return {
      orderId: order.id,
      orderCode: order.order_code,
      email: order.user_email,
      totalAmount: order.total_amount,
      paymentStatus: order.payment_status,
      orderStatus: order.order_status, // NEW: Order fulfillment status
      createdAt: order.created_at,
      updatedAt: order.updated_at
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    Logger.error('Failed to get order status', error, { orderCode });
    throw new AppError('Lỗi server nội bộ khi lấy trạng thái đơn hàng', 500);
  }
};

/**
 * Get orders by email with related download tasks
 * @param {string} email - Customer email
 * @returns {Promise<Array>} - Array of orders with download tasks
 * @throws {AppError} - If query fails
 */
const getOrdersByEmail = async (email) => {
  try {
    if (!email) {
      throw new AppError('Email là bắt buộc', 400);
    }

    const DownloadTask = require('../models/downloadTask.model');

    // Query orders by email (case-insensitive) with related download tasks
    const orders = await Order.findAll({
      where: sequelize.where(
        sequelize.fn('LOWER', sequelize.col('user_email')),
        sequelize.fn('LOWER', email)
      ),
      include: [{
        model: DownloadTask,
        as: 'items', // Use the association alias defined in models/index.js
        attributes: ['id', 'course_url', 'title', 'status', 'drive_link', 'price', 'created_at', 'updated_at'],
        required: false // LEFT JOIN to include orders even without tasks
      }],
      attributes: [
        'id',
        'order_code',
        'user_email',
        'total_amount',
        'payment_status',
        'order_status',
        'created_at',
        'updated_at'
      ],
      order: [['id', 'DESC']], // Newest orders first
      raw: false // Need Sequelize instances for associations
    });

    return orders;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    Logger.error('Failed to get orders by email', error, { email });
    throw new AppError('Lỗi server nội bộ khi lấy danh sách đơn hàng', 500);
  }
};

module.exports = {
  createOrder,
  processPaymentWebhook,
  getOrderStatus,
  getOrdersByEmail
};
