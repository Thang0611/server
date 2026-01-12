/**
 * Webhook controller for handling webhook-related HTTP requests
 * @module controllers/webhook
 */

const webhookService = require('../services/webhook.service');
const { asyncHandler } = require('../middleware/errorHandler.middleware');
const { AppError } = require('../middleware/errorHandler.middleware');
const Logger = require('../utils/logger.util');

/**
 * Handles download finalization webhook
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const finalizeDownload = asyncHandler(async (req, res, next) => {
  const { secret_key, task_id, folder_name } = req.body;

  if (!secret_key || !task_id || !folder_name) {
    throw new AppError('Thiếu thông tin bắt buộc', 400);
  }

  const result = await webhookService.finalizeDownload(task_id, folder_name, secret_key);

  res.json({
    success: true,
    ...result
  });
});

module.exports = {
  finalizeDownload
};
