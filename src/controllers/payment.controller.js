/**
 * Payment controller for handling payment-related HTTP requests
 * @module controllers/payment
 */

const paymentService = require('../services/payment.service');
const { asyncHandler } = require('../middleware/errorHandler.middleware');
const { AppError } = require('../middleware/errorHandler.middleware');
const Logger = require('../utils/logger.util');
const { Order } = require('../models');

/**
 * Creates a new order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const createOrder = asyncHandler(async (req, res, next) => {
  const { email, courses } = req.body;

  const result = await paymentService.createOrder(email, courses);

  res.json({
    success: true,
    ...result
  });
});

/**
 * Handles SePay payment webhook
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const handleWebhook = asyncHandler(async (req, res, next) => {
  // Log webhook event for debugging
  Logger.info('SePay webhook received', {
    body: req.body,
    headers: req.headers,
    timestamp: new Date().toISOString()
  });

  // Security Check: Verify Authorization header
  const authHeader = req.headers.authorization;
  const expectedAuth = `Apikey ${process.env.SEPAY_API_KEY}`;
  
  if (!authHeader || authHeader !== expectedAuth) {
    Logger.warn('Invalid or missing Authorization header', {
      received: authHeader ? 'Present' : 'Missing',
      expected: expectedAuth ? 'Present' : 'Missing (SEPAY_API_KEY not set)'
    });
    return res.status(403).json({ 
      success: false, 
      message: 'Unauthorized' 
    });
  }

  // Extract order code from payload
  // First, try req.body.code (if it exists and starts with 'DH')
  let orderCode = null;
  
  if (req.body.code && typeof req.body.code === 'string' && req.body.code.toUpperCase().startsWith('DH')) {
    orderCode = req.body.code.toUpperCase();
    Logger.info('Order code extracted from req.body.code', { orderCode });
  } else if (req.body.content && typeof req.body.content === 'string') {
    // Fallback: Extract from req.body.content using regex
    const orderCodeMatch = req.body.content.match(/DH\d+/i);
    if (orderCodeMatch) {
      orderCode = orderCodeMatch[0].toUpperCase();
      Logger.info('Order code extracted from req.body.content', { orderCode });
    }
  }

  // Validate required fields
  if (!orderCode) {
    Logger.warn('Order code not found in payload', { 
      body: req.body,
      code: req.body.code,
      content: req.body.content 
    });
    // Return success to stop SePay retries
    return res.json({ 
      success: true, 
      message: 'Order code not found in payload' 
    });
  }

  if (!req.body.transferAmount || isNaN(parseFloat(req.body.transferAmount))) {
    Logger.warn('Invalid transferAmount in payload', { 
      transferAmount: req.body.transferAmount 
    });
    // Return success to stop SePay retries
    return res.json({ 
      success: true, 
      message: 'Invalid transfer amount' 
    });
  }

  try {
    const result = await paymentService.processPaymentWebhook(
      orderCode,
      parseFloat(req.body.transferAmount),
      req.body
    );

    Logger.info('Webhook processing result', result);

    // Always return success to prevent SePay from retrying
    // The service handles all error cases and returns success for invalid cases
    res.json({ 
      success: true,
      message: 'Payment processed',
      ...result
    });
  } catch (error) {
    Logger.error('Webhook handler error', error, {
      orderCode,
      transferAmount: req.body.transferAmount,
      stack: error.stack
    });

    // Always return success to prevent SePay retries
    // Log error for manual investigation
    res.json({ 
      success: true, 
      message: 'Webhook processed (errors logged)',
      error: error.message 
    });
  }
});

/**
 * Checks order payment status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const checkStatus = asyncHandler(async (req, res, next) => {
  const { orderCode } = req.params;

  const orderStatus = await paymentService.getOrderStatus(orderCode);

  if (!orderStatus) {
    throw new AppError('Không tìm thấy đơn hàng', 404);
  }

  res.json({
    success: true,
    status: orderStatus.payment_status
  });
});

/**
 * Checks order status for client-side polling
 * Optimized to only fetch necessary fields from database
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const checkOrderStatus = asyncHandler(async (req, res, next) => {
  try {
    const { orderCode } = req.params;

    // Log request for debugging
    Logger.info('Check order status request', {
      orderCode: orderCode,
      method: req.method,
      path: req.path,
      originalUrl: req.originalUrl
    });

    if (!orderCode) {
      return res.status(400).json({
        success: false,
        message: 'Order code is required'
      });
    }

    // Validate order code format - detect malformed codes from client-side template issues
    // Check for template variables that weren't replaced (e.g., {orderData.orderCode}, ${orderCode}, etc.)
    const malformedPatterns = [
      /\$\{.*\}/,           // ${variable}
      /\{.*\}/,              // {variable}
      /%7B.*%7D/i,           // URL-encoded {variable}
      /\$\%7B.*\%7D/i        // $%7Bvariable%7D
    ];

    const isMalformed = malformedPatterns.some(pattern => pattern.test(orderCode));
    
    if (isMalformed) {
      Logger.warn('Malformed order code detected - likely client-side template issue', {
        orderCode: orderCode,
        decoded: decodeURIComponent(orderCode),
        path: req.path,
        method: req.method
      });
      
      return res.status(400).json({
        success: false,
        message: 'Invalid order code format. The order code appears to be a template variable that was not replaced. Please ensure the order code is properly interpolated on the client side.',
        received: orderCode,
        hint: 'Order code should be in format: DH123456 (not {orderData.orderCode} or ${orderCode})'
      });
    }

    // Validate order code format - should start with 'DH' followed by digits
    if (!/^DH\d+$/i.test(orderCode)) {
      Logger.warn('Invalid order code format', {
        orderCode: orderCode,
        expectedFormat: 'DH followed by digits (e.g., DH123456)'
      });
      
      return res.status(400).json({
        success: false,
        message: 'Invalid order code format. Order code must start with "DH" followed by digits (e.g., DH123456)',
        received: orderCode
      });
    }

    // Normalize order code to uppercase for consistency
    const normalizedOrderCode = orderCode.toUpperCase();

    // Find order in database with only necessary fields
    // Optimization: Only select required fields, no relationship tree
    const order = await Order.findOne({
      where: { order_code: normalizedOrderCode },
      attributes: ['id', 'order_code', 'payment_status', 'total_amount']
    });

    if (!order) {
      Logger.info('Order not found', {
        orderCode: normalizedOrderCode,
        searched: orderCode
      });
      
      return res.status(404).json({
        success: false,
        message: 'Order not found',
        orderCode: normalizedOrderCode
      });
    }

    Logger.info('Order status retrieved successfully', {
      orderCode: order.order_code,
      status: order.payment_status,
      amount: order.total_amount
    });

    // Return simplified response for polling
    res.json({
      success: true,
      status: order.payment_status,
      amount: order.total_amount
    });
  } catch (error) {
    Logger.error('Error checking order status', error, {
      orderCode: req.params.orderCode,
      method: req.method,
      path: req.path,
      stack: error.stack
    });

    // Prevent server crash with error handling
    res.status(500).json({
      success: false,
      message: 'Internal server error while checking order status'
    });
  }
});

module.exports = {
  createOrder,
  handleWebhook,
  checkStatus,
  checkOrderStatus
};