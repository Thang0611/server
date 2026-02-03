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
const { calculateOrderPrice, getComboUnitPrice, getComboPriceDistribution, pricingConfig, filterValidCourses, calculateAllCoursesOfferPrice } = require('../utils/pricing.util');
const { sendPaymentSuccessEmail } = require('./email.service');
const { checkExistingDownload } = require('./checkExistingDownload.service');
const grantAccessService = require('./grantAccess.service');
const userEnrollmentService = require('./userEnrollment.service');

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
 * @param {number|null} userId - Optional authenticated user ID
 * @returns {Promise<Object>} - Created order with orderCode, QR code, courses, and download tasks
 * @throws {AppError} - If validation fails or creation fails
 */
const createOrder = async (email, courses, userId = null) => {
  try {
    // Validate input
    if (!email || !courses || !Array.isArray(courses) || courses.length === 0) {
      throw new AppError('Email và danh sách khóa học là bắt buộc', 400);
    }

    // Filter valid courses
    const validCourses = filterValidCourses(courses);
    const validCount = validCourses.length;

    if (validCourses.length === 0) {
      throw new AppError('Không có khóa học hợp lệ', 400);
    }

    // Calculate total price
    // If courses have courseId (from courses page), use their prices from database
    // Otherwise, use dynamic pricing (combo/per-course)
    const hasCourseIds = validCourses.some(c => c.courseId);
    let totalAmount;

    if (hasCourseIds) {
      // Courses from database - use their prices
      totalAmount = validCourses.reduce((sum, course) => {
        const coursePrice = course.price !== undefined && course.price !== null
          ? parseFloat(course.price)
          : pricingConfig.PRICE_PER_COURSE;
        return sum + coursePrice;
      }, 0);

      Logger.info('Using database prices for courses', {
        courseCount: validCount,
        totalAmount,
        prices: validCourses.map(c => ({
          courseId: c.courseId,
          price: c.price || pricingConfig.PRICE_PER_COURSE
        }))
      });
    } else {
      // URL-based courses - use dynamic pricing
      const { totalPrice } = calculateOrderPrice(courses);
      totalAmount = totalPrice;

      Logger.info('Using dynamic pricing for URL courses', {
        courseCount: validCount,
        totalAmount
      });
    }

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
      payment_status: 'pending', // Order is created as pending, waiting for payment confirmation
      user_id: userId // Link to authenticated user (null for anonymous/legacy orders)
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

      // If combo applies, update task prices with accurate distribution
      if (comboUnitPrice !== null && downloadTasks.length > 0) {
        try {
          const comboType = validCount === 5 ? 'Combo 5' : validCount === 10 ? 'Combo 10' : 'Unknown';

          // Get accurate price distribution for each course
          const priceDistribution = getComboPriceDistribution(validCount, totalAmount);

          if (priceDistribution && priceDistribution.length === downloadTasks.length) {
            // Update each task with its specific price
            const updatePromises = downloadTasks.map((task, index) => {
              const taskPrice = priceDistribution[index];
              return DownloadTask.update(
                { price: taskPrice },
                {
                  where: {
                    id: task.id,
                    order_id: order.id
                  }
                }
              );
            });

            await Promise.all(updatePromises);

            // Verify total
            const calculatedTotal = priceDistribution.reduce((sum, price) => sum + price, 0);

            Logger.success(`Updated ${comboType} task prices with accurate distribution`, {
              orderId: order.id,
              taskCount: downloadTasks.length,
              priceDistribution,
              calculatedTotal,
              expectedTotal: totalAmount,
              isExact: calculatedTotal === totalAmount
            });

            // Refresh tasks to get updated prices
            const taskIds = downloadTasks.map(task => task.id);
            downloadTasks = await DownloadTask.findAll({
              where: {
                id: taskIds,
                order_id: order.id
              }
            });
          } else {
            Logger.warn('Price distribution length mismatch', {
              orderId: order.id,
              taskCount: downloadTasks.length,
              distributionLength: priceDistribution?.length,
              fallback: 'Using base unit price for all tasks'
            });

            // Fallback: use base unit price for all tasks
            const taskIds = downloadTasks.map(task => task.id);
            await DownloadTask.update(
              { price: comboUnitPrice },
              {
                where: {
                  id: taskIds,
                  order_id: order.id
                }
              }
            );

            downloadTasks = await DownloadTask.findAll({
              where: {
                id: taskIds,
                order_id: order.id
              }
            });
          }
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
    // For combo orders, use accurate price distribution
    const priceDistribution = comboUnitPrice !== null
      ? getComboPriceDistribution(validCount, totalAmount)
      : null;

    const coursesInfo = validCourses.map((course, index) => {
      let coursePrice;

      // If courses have courseId (from database), always use their prices
      if (hasCourseIds) {
        coursePrice = course.price !== undefined && course.price !== null
          ? parseFloat(course.price)
          : pricingConfig.PRICE_PER_COURSE;
      } else {
        // URL-based courses - use combo distribution or per-course pricing
        if (priceDistribution && priceDistribution.length > index) {
          // Use distributed price for combo orders
          coursePrice = priceDistribution[index];
        } else if (comboUnitPrice !== null) {
          // Fallback to base unit price if distribution not available
          coursePrice = comboUnitPrice;
        } else {
          // Use course price or default per-course price
          coursePrice = course.price !== undefined && course.price !== null
            ? parseFloat(course.price)
            : pricingConfig.PRICE_PER_COURSE;
        }
      }

      return {
        url: course.url,
        title: course.title || null,
        price: coursePrice,
        courseId: course.courseId || null
      };
    });

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

    // ✅ CREATE USER ENROLLMENTS
    // Link authenticated user to purchased courses
    // This enables /my-courses page functionality
    try {
      const enrollmentResult = await userEnrollmentService.createEnrollmentsForOrder(order.id);
      if (enrollmentResult.enrollmentsCreated > 0) {
        Logger.success('[Enrollment] Created user enrollments for order', {
          orderId: order.id,
          userId: order.user_id,
          enrollmentsCreated: enrollmentResult.enrollmentsCreated
        });
      }
    } catch (enrollmentError) {
      // Log error but don't fail webhook - payment is already confirmed
      Logger.error('Failed to create user enrollments', enrollmentError, {
        orderId: order.id,
        impact: 'Payment confirmed but enrollments not created'
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
          attributes: ['id', 'email', 'course_url', 'title', 'course_type', 'category']
        });

        Logger.info('Processing tasks after payment', {
          orderId: order.id,
          taskCount: tasks.length
        });

        // ================================================================
        // STEP 0: CHECK EXISTING DOWNLOADS (PERMANENT COURSES ONLY)
        // ================================================================
        // Chỉ kiểm tra existing download cho PERMANENT courses
        // Temporary courses luôn phải download lại
        const tasksWithDriveLink = [];
        const tasksNeedDownload = [];

        for (const task of tasks) {
          const courseType = task.course_type || 'temporary'; // Default to temporary for backward compatibility

          // Chỉ check existing download cho permanent courses
          if (courseType === 'permanent') {
            Logger.info('[Existing Download Check] Checking for existing permanent course', {
              taskId: task.id,
              orderId: order.id,
              courseUrl: task.course_url,
              email: task.email,
              courseType
            });

            const existingTask = await checkExistingDownload(task.course_url, courseType);

            if (existingTask && existingTask.drive_link) {
              Logger.info('[Existing Download Found] Permanent course already downloaded', {
                taskId: task.id,
                orderId: order.id,
                courseUrl: task.course_url,
                existingDriveLink: existingTask.drive_link,
                existingTaskId: existingTask.id,
                email: task.email
              });

              // Khóa học permanent đã được download rồi
              // Update task với drive_link và grant access ngay
              try {
                Logger.info('[Task Update] Updating task with existing drive_link', {
                  taskId: task.id,
                  orderId: order.id,
                  driveLink: existingTask.drive_link,
                  previousStatus: task.status
                });

                await task.update({
                  drive_link: existingTask.drive_link,
                  status: 'completed'
                });

                Logger.success('[Task Updated] Task marked as completed with existing drive_link', {
                  taskId: task.id,
                  orderId: order.id,
                  driveLink: existingTask.drive_link,
                  email: task.email
                });

                // Grant access ngay lập tức
                Logger.info('[Grant Access] Starting grant access for existing permanent course', {
                  taskId: task.id,
                  orderId: order.id,
                  email: task.email,
                  driveLink: existingTask.drive_link,
                  courseName: task.title || 'Khóa học'
                });

                const grantResult = await grantAccessService.grantAccess(
                  order.id.toString(),
                  task.email,
                  [{
                    drive_link: existingTask.drive_link,
                    course_name: task.title || 'Khóa học'
                  }]
                );

                Logger.success('[Grant Access Completed] Access granted and email sent for existing permanent course', {
                  taskId: task.id,
                  orderId: order.id,
                  email: task.email,
                  driveLink: existingTask.drive_link,
                  grantSuccess: grantResult.success,
                  successCount: grantResult.successList?.length || 0,
                  failedCount: grantResult.failedList?.length || 0
                });

                tasksWithDriveLink.push(task);
                continue; // Skip enrollment and download
              } catch (grantError) {
                Logger.error('[Grant Access Failed] Failed to grant access to existing download', grantError, {
                  taskId: task.id,
                  orderId: order.id,
                  courseUrl: task.course_url,
                  email: task.email,
                  driveLink: existingTask.drive_link,
                  errorMessage: grantError.message,
                  errorStack: grantError.stack
                });
                // Fall through to download if grant fails
              }
            } else {
              Logger.debug('[Existing Download Not Found] No existing download found for permanent course', {
                taskId: task.id,
                orderId: order.id,
                courseUrl: task.course_url,
                courseType
              });
            }
          }

          // Khóa học chưa có drive_link hoặc là temporary → cần download
          tasksNeedDownload.push(task);
        }

        Logger.info('Task classification after payment', {
          orderId: order.id,
          total: tasks.length,
          withDriveLink: tasksWithDriveLink.length,
          needDownload: tasksNeedDownload.length
        });

        // ================================================================
        // STEP 1: ENROLL COURSES THAT NEED DOWNLOAD
        // ================================================================
        let enrolledCount = 0;
        let enrollFailedCount = 0;
        const enrolledTasks = [];

        // Chỉ enroll những tasks cần download
        for (const task of tasksNeedDownload) {
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

/**
 * Creates a new order with All-Courses Offer pricing
 * First course = 199k (includes all-courses access), additional = 39k each
 * @param {string} email - Customer email
 * @param {Array} courses - Array of course objects with url, title, price, courseId properties
 * @param {number|null} userId - Optional authenticated user ID
 * @returns {Promise<Object>} - Created order with orderCode, QR code, courses, and download tasks
 * @throws {AppError} - If validation fails or creation fails
 */
const createOrderAllCourses = async (email, courses, userId = null) => {
  try {
    // Validate input
    if (!email || !courses || !Array.isArray(courses) || courses.length === 0) {
      throw new AppError('Email và danh sách khóa học là bắt buộc', 400);
    }

    // Filter valid courses
    const validCourses = filterValidCourses(courses);
    const validCount = validCourses.length;

    if (validCourses.length === 0) {
      throw new AppError('Không có khóa học hợp lệ', 400);
    }

    // Calculate total price using All-Courses Offer pricing
    const totalAmount = calculateAllCoursesOfferPrice(validCount);

    Logger.info('All-Courses Offer order', {
      email,
      courseCount: validCount,
      totalAmount,
      userId: userId || 'anonymous',
      pricing: {
        firstCourse: pricingConfig.ALL_COURSES_FIRST_PRICE,
        additionalCourse: pricingConfig.ALL_COURSES_ADDITIONAL_PRICE
      }
    });

    // Create order in database
    const order = await Order.create({
      order_code: 'TEMP',
      user_email: email,
      total_amount: totalAmount,
      payment_status: 'pending',
      order_type: 'all_courses_offer', // Mark as All-Courses Offer
      user_id: userId // Link to authenticated user (null for anonymous/legacy orders)
    });

    // Generate sequential order code
    const orderCode = generateOrderCode(order.id);
    await order.update({ order_code: orderCode });

    Logger.success('All-Courses Offer order created', {
      orderId: order.id,
      orderCode: order.order_code,
      email: order.user_email,
      totalAmount: order.total_amount
    });

    // Lifecycle log
    lifecycleLogger.logOrderCreated(
      order.id,
      email,
      totalAmount,
      order.payment_status,
      {
        successCount: validCount,
        totalCount: validCount,
        failedUrls: [],
        orderType: 'all_courses_offer'
      }
    );

    // Create download tasks
    let downloadTasks = [];
    try {
      const tasksResult = await downloadService.createDownloadTasks(
        order.id,
        email,
        validCourses,
        null
      );
      downloadTasks = tasksResult.tasks || [];

      Logger.success('Download tasks created for All-Courses offer', {
        orderId: order.id,
        taskCount: downloadTasks.length
      });
    } catch (taskError) {
      Logger.error('Failed to create download tasks for All-Courses order', taskError, {
        orderId: order.id,
        email
      });
    }

    // Generate QR code URL
    const qrCodeUrl = generateVietQR(totalAmount, orderCode);

    // Distribute prices for response (first course gets ALL_COURSES_FIRST_PRICE, rest get ADDITIONAL)
    const coursesInfo = validCourses.map((course, index) => {
      const coursePrice = index === 0
        ? pricingConfig.ALL_COURSES_FIRST_PRICE
        : pricingConfig.ALL_COURSES_ADDITIONAL_PRICE;

      return {
        url: course.url,
        title: course.title || null,
        price: coursePrice,
        courseId: course.courseId || null
      };
    });

    return {
      orderId: order.id,
      orderCode: order.order_code,
      totalAmount: order.total_amount,
      paymentStatus: order.payment_status,
      qrCodeUrl: qrCodeUrl,
      courses: coursesInfo,
      orderType: 'all_courses_offer',
      allCoursesDriveFolder: pricingConfig.ALL_COURSES_DRIVE_FOLDER
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    Logger.error('Failed to create All-Courses offer order', error, { email, coursesCount: courses?.length });
    throw new AppError('Lỗi server nội bộ khi tạo đơn hàng All-Courses Offer', 500);
  }
};

module.exports = {
  createOrder,
  createOrderAllCourses,
  processPaymentWebhook,
  getOrderStatus,
  getOrdersByEmail
};
