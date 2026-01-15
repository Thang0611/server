/**
 * Info course controller for handling course information HTTP requests
 * @module controllers/infoCourse
 */

const infoCourseService = require('../services/infoCourse.service');
const { asyncHandler } = require('../middleware/errorHandler.middleware');
const Logger = require('../utils/logger.util');
const { calculateTotalPrice, getComboUnitPrice, pricingConfig } = require('../utils/pricing.util');

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
  const validCount = validCourses.length;
  const totalAmount = calculateTotalPrice(validCount);

  // Check if combo applies and calculate unit price
  const comboUnitPrice = getComboUnitPrice(validCount, totalAmount);
  
  // Determine the unit price to use for each course
  const unitPrice = comboUnitPrice !== null ? comboUnitPrice : pricingConfig.PRICE_PER_COURSE;

  // Update prices in results array for valid courses
  const updatedResults = results.map(course => {
    if (course.success === true) {
      return {
        ...course,
        price: unitPrice
      };
    }
    return course;
  });

  Logger.debug('Course info response prepared', {
    validCount,
    totalAmount,
    unitPrice,
    isCombo: comboUnitPrice !== null,
    comboType: validCount === 5 ? 'Combo 5' : validCount === 10 ? 'Combo 10' : null
  });

  res.status(200).json({
    success: true,
    results: updatedResults,
    totalAmount: totalAmount,
    validCourseCount: validCourses.length
  });
});

module.exports = {
  getCourseInfo
};
