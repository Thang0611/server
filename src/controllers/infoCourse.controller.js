/**
 * Info course controller for handling course information HTTP requests
 * @module controllers/infoCourse
 */

const infoCourseService = require('../services/infoCourse.service');
const { asyncHandler } = require('../middleware/errorHandler.middleware');
const Logger = require('../utils/logger.util');
const { calculateTotalPrice, getComboUnitPrice, getComboPriceDistribution, pricingConfig } = require('../utils/pricing.util');

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

  // Check if combo applies and get price distribution
  const comboUnitPrice = getComboUnitPrice(validCount, totalAmount);
  const priceDistribution = comboUnitPrice !== null 
    ? getComboPriceDistribution(validCount, totalAmount)
    : null;
  
  // Update prices in results array for valid courses
  // For combo orders, use accurate price distribution
  let validCourseIndex = 0;
  const updatedResults = results.map(course => {
    if (course.success === true) {
      let coursePrice;
      if (priceDistribution && validCourseIndex < priceDistribution.length) {
        // Use distributed price for combo orders
        coursePrice = priceDistribution[validCourseIndex];
        validCourseIndex++;
      } else if (comboUnitPrice !== null) {
        // Fallback to base unit price if distribution not available
        coursePrice = comboUnitPrice;
        validCourseIndex++;
      } else {
        // Use default per-course price
        coursePrice = pricingConfig.PRICE_PER_COURSE;
        validCourseIndex++;
      }
      
      return {
        ...course,
        price: coursePrice
      };
    }
    return course;
  });

  // Calculate average unit price for logging
  const avgUnitPrice = priceDistribution 
    ? priceDistribution.reduce((sum, p) => sum + p, 0) / priceDistribution.length
    : (comboUnitPrice !== null ? comboUnitPrice : pricingConfig.PRICE_PER_COURSE);
  
  Logger.debug('Course info response prepared', {
    validCount,
    totalAmount,
    priceDistribution,
    avgUnitPrice: Math.round(avgUnitPrice),
    isCombo: comboUnitPrice !== null,
    comboType: validCount === 5 ? 'Combo 5' : validCount === 10 ? 'Combo 10' : null,
    sumCheck: priceDistribution ? priceDistribution.reduce((sum, p) => sum + p, 0) : null
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
