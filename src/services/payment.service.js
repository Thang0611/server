/**
 * Payment service for handling payment-related business logic
 * @module services/payment
 */

const { Order } = require('../models');
const downloadService = require('./download.service');
const infoCourseService = require('./infoCourse.service');
const { generateVietQR } = require('../utils/qrGenerator');
const Logger = require('../utils/logger.util');
const { AppError } = require('../middleware/errorHandler.middleware');

const PRICE_PER_COURSE = 2000; // VND

/**
 * Generates a unique order code
 * Format: DH + 6 digits (e.g., DH000001, DH000002)
 * @returns {Promise<string>} - Unique order code
 */
const generateOrderCode = async () => {
  let orderCode;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;

  while (!isUnique && attempts < maxAttempts) {
    // Generate order code: DH + 6 digits (padded with zeros)
    const sequence = String(Date.now()).slice(-6).padStart(6, '0');
    orderCode = `DH${sequence}`;

    // Check if order code already exists
    const existingOrder = await Order.findOne({
      where: { order_code: orderCode },
      attributes: ['id']
    });

    if (!existingOrder) {
      isUnique = true;
    } else {
      attempts++;
      // Add small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  if (!isUnique) {
    throw new AppError('Không thể tạo mã đơn hàng duy nhất', 500);
  }

  return orderCode;
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

    // Filter only valid courses (those with success: true from crawl step)
    // If courses come from frontend after crawl, they should have url property
    const validCourses = courses.filter(course => course.url);

    if (validCourses.length === 0) {
      throw new AppError('Không có khóa học hợp lệ', 400);
    }

    // Calculate total amount based on valid courses
    const totalAmount = validCourses.length * PRICE_PER_COURSE;

    // Generate unique order code
    const orderCode = await generateOrderCode();

    // Create order in database with status 'pending' (waiting for payment)
    const order = await Order.create({
      order_code: orderCode,
      user_email: email,
      total_amount: totalAmount,
      payment_status: 'pending' // Order is created as pending, waiting for payment confirmation
    });

    Logger.success('Order created', {
      orderId: order.id,
      orderCode: order.order_code,
      email: order.user_email,
      totalAmount: order.total_amount
    });

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
    const coursesInfo = validCourses.map(course => ({
      url: course.url,
      title: course.title || null,
      price: course.price !== undefined && course.price !== null ? parseFloat(course.price) : PRICE_PER_COURSE,
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

    // Transaction: Update Order.payment_status to 'paid' AND update related DownloadTasks.status to 'processing'
    await order.update({
      payment_status: 'paid',
      payment_gateway_data: paymentGatewayData
    }, { transaction });

    // Update download tasks status from 'paid' to 'processing'
    const [updatedCount] = await DownloadTask.update(
      { status: 'processing' },
      {
        where: {
          order_id: order.id,
          status: 'paid'
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

    // After commit, trigger download process
    if (updatedCount > 0) {
      try {
        // Reload order with all relations for processing
        const orderForProcessing = await Order.findByPk(order.id, {
          attributes: ['id', 'order_code', 'user_email', 'total_amount', 'payment_status']
        });
        
        // Process order (this will trigger worker to handle downloads)
        await downloadService.processOrder(orderForProcessing);
      } catch (processError) {
        // Log error but don't fail webhook - payment is already confirmed
        Logger.error('Failed to trigger download process after payment', processError, {
          orderId: order.id
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
      attributes: ['id', 'order_code', 'user_email', 'total_amount', 'payment_status', 'created_at', 'updated_at']
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

module.exports = {
  createOrder,
  processPaymentWebhook,
  getOrderStatus
};
