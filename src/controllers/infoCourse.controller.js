/**
 * Info course controller for handling course information HTTP requests
 * @module controllers/infoCourse
 */

const infoCourseService = require('../services/infoCourse.service');
const { asyncHandler } = require('../middleware/errorHandler.middleware');
const Logger = require('../utils/logger.util');

/**
 * Gets course information for provided URLs
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const getCourseInfo = asyncHandler(async (req, res, next) => {
  const { urls } = req.body;

  Logger.debug('Course info request received', { urlCount: urls?.length || 0 });

  const results = await infoCourseService.getCourseInfo(urls);

  // Calculate total amount for valid courses (success: true)
  const validCourses = results.filter(course => course.success === true);
  const totalAmount = validCourses.length * 50000; // 50000 VND per course

  res.status(200).json({
    success: true,
    results,
    totalAmount: totalAmount,
    validCourseCount: validCourses.length
  });
});

module.exports = {
  getCourseInfo
};
