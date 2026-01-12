/**
 * Download controller for handling download-related HTTP requests
 * @module controllers/download
 */

const downloadService = require('../services/download.service');
const { asyncHandler } = require('../middleware/errorHandler.middleware');
const { AppError } = require('../middleware/errorHandler.middleware');
const Logger = require('../utils/logger.util');

/**
 * Handles download request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const download = asyncHandler(async (req, res, next) => {
  const signature = req.headers['x-signature'];
  const timestamp = req.headers['x-timestamp'];
  const { order_id, email, urls, courses, phone_number } = req.body;

  // Validate required fields
  if (!signature || !timestamp || !order_id || !email) {
    throw new AppError('Thiếu thông tin bắt buộc', 400);
  }

  // Verify signature
  const isValid = downloadService.validateSignature(order_id, email, timestamp, signature);
  if (!isValid) {
    Logger.warn('Invalid signature in download request', { order_id });
    throw new AppError('Sai chữ ký bảo mật', 403);
  }

  // Normalize input courses/urls
  let inputCourses = [];
  if (Array.isArray(courses)) {
    inputCourses = courses;
  } else if (Array.isArray(urls)) {
    inputCourses = urls.map(url => ({ url }));
  }

  // Create download tasks
  const { tasks, uniqueUrls, count } = await downloadService.createDownloadTasks(
    order_id,
    email,
    inputCourses,
    phone_number
  );

  res.status(200).json({
    status: 'queued',
    message: `Đã nhận ${count} khóa học`,
    order_id,
    urls: uniqueUrls
  });
});

module.exports = {
  download
};