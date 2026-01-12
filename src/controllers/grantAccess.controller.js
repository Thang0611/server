/**
 * Grant access controller for handling Google Drive access granting HTTP requests
 * @module controllers/grantAccess
 */

const grantAccessService = require('../services/grantAccess.service');
const { asyncHandler } = require('../middleware/errorHandler.middleware');
const Logger = require('../utils/logger.util');

/**
 * Handles grant access request
 * Responds immediately to prevent WordPress timeout, then processes in background
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const grantAccess = asyncHandler(async (req, res, next) => {
  // Respond immediately to prevent WordPress timeout
  res.json({
    status: 'received',
    message: 'Node.js đang xử lý ngầm...'
  });

  const { order_id, email, courses } = req.body;

  // Process in background (don't await to prevent blocking)
  grantAccessService.grantAccess(order_id, email, courses)
    .then(result => {
      Logger.info('Grant access processing completed', {
        orderId: order_id,
        success: result.success,
        successCount: result.successList?.length || 0,
        failedCount: result.failedList?.length || 0
      });
    })
    .catch(error => {
      Logger.error('Grant access processing failed', error, {
        orderId: order_id,
        email
      });
    });
});

module.exports = {
  grantAccess
};
