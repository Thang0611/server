/**
 * Enroll controller for handling course enrollment HTTP requests
 * @module controllers/enroll
 */

const enrollService = require('../services/enroll.service');
const { asyncHandler } = require('../middleware/errorHandler.middleware');
const { AppError } = require('../middleware/errorHandler.middleware');
const Logger = require('../utils/logger.util');

/**
 * Handles course enrollment request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const enrollController = asyncHandler(async (req, res, next) => {
  const { urls, email } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    throw new AppError("Thiếu mảng 'urls' hoặc mảng rỗng", 400);
  }

  if (!email || typeof email !== 'string') {
    throw new AppError('Email không hợp lệ', 400);
  }

  Logger.info('Processing enrollment request', { email, urlCount: urls.length });

  const results = await enrollService.enrollCourses(urls, email);

  res.json({
    success: true,
    results
  });
});

module.exports = {
  enrollController
};
