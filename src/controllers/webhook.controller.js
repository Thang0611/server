/**
 * Webhook controller for handling webhook-related HTTP requests
 * @module controllers/webhook
 */

const crypto = require('crypto');
const webhookService = require('../services/webhook.service');
const { asyncHandler } = require('../middleware/errorHandler.middleware');
const { AppError } = require('../middleware/errorHandler.middleware');
const Logger = require('../utils/logger.util');

/**
 * Handles download finalization webhook
 * ✅ SECURITY: Xác thực HMAC-SHA256 và timestamp để ngăn chặn replay attack
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const finalizeDownload = asyncHandler(async (req, res, next) => {
  const { task_id, folder_name, timestamp } = req.body;
  const signature = req.headers['x-signature'];
  const requestTimestamp = req.headers['x-timestamp'];

  // Validate required fields
  if (!task_id || !folder_name) {
    throw new AppError('Thiếu thông tin bắt buộc (task_id, folder_name)', 400);
  }

  if (!signature || !requestTimestamp) {
    throw new AppError('Thiếu thông tin xác thực (X-Signature, X-Timestamp)', 401);
  }

  // 1. Verify timestamp (reject if older than 5 minutes = 300 seconds)
  const now = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(requestTimestamp, 10);
  const timeDiff = Math.abs(now - requestTime);

  if (timeDiff > 300) {
    Logger.warn('Webhook request expired', {
      timeDiff,
      requestTime,
      now,
      taskId: task_id
    });
    throw new AppError('Request đã hết hạn (quá 5 phút)', 401);
  }

  // 2. Verify HMAC-SHA256 signature
  const SECRET_KEY = process.env.API_SECRET_KEY;
  
  if (!SECRET_KEY) {
    Logger.error('API_SECRET_KEY not configured');
    throw new AppError('Server configuration error', 500);
  }

  // Reconstruct message (same as Python: task_id + folder_name + timestamp)
  const message = `${task_id}${folder_name}${requestTimestamp}`;
  const expectedSignature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(message)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );

  if (!isValid) {
    Logger.warn('Invalid webhook signature', {
      taskId: task_id,
      received: signature.substring(0, 10) + '...',
      expected: expectedSignature.substring(0, 10) + '...'
    });
    throw new AppError('Chữ ký không hợp lệ', 403);
  }

  // 3. Signature valid, process the webhook
  Logger.info('Webhook authenticated successfully', {
    taskId: task_id,
    folderName: folder_name
  });

  const result = await webhookService.finalizeDownload(task_id, folder_name, SECRET_KEY);

  res.json({
    success: true,
    ...result
  });
});

module.exports = {
  finalizeDownload
};
