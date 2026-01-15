/**
 * Pricing utility for calculating course order totals
 * @module utils/pricing
 */

const pricingConfig = require('../config/pricing.config');
const Logger = require('./logger.util');

/**
 * Calculates the total price for a given number of valid courses
 * Pricing logic:
 * - < 5 courses: count * PRICE_PER_COURSE
 * - = 5 courses: PRICE_COMBO_5
 * - = 10 courses: PRICE_COMBO_10
 * - Other quantities: count * PRICE_PER_COURSE (for now)
 * 
 * @param {number} validCourseCount - Number of valid courses
 * @returns {number} - Total price in VND
 */
const calculateTotalPrice = (validCourseCount) => {
  if (!validCourseCount || validCourseCount <= 0) {
    return 0;
  }

  const { PRICE_PER_COURSE, PRICE_COMBO_5, PRICE_COMBO_10 } = pricingConfig;

  // Exact combo matches
  if (validCourseCount === 5) {
    Logger.debug('Applying combo 5 pricing', { count: validCourseCount, price: PRICE_COMBO_5 });
    return PRICE_COMBO_5;
  }

  if (validCourseCount === 10) {
    Logger.debug('Applying combo 10 pricing', { count: validCourseCount, price: PRICE_COMBO_10 });
    return PRICE_COMBO_10;
  }

  // For other quantities, use per-course pricing
  const totalPrice = validCourseCount * PRICE_PER_COURSE;
  Logger.debug('Applying per-course pricing', { 
    count: validCourseCount, 
    pricePerCourse: PRICE_PER_COURSE,
    totalPrice 
  });
  
  return totalPrice;
};

/**
 * Filters valid courses from an array
 * A course is considered valid if it has a valid URL
 * 
 * @param {Array} courses - Array of course objects
 * @returns {Array} - Array of valid courses
 */
const filterValidCourses = (courses) => {
  if (!Array.isArray(courses)) {
    return [];
  }

  return courses.filter(course => {
    // Course is valid if it has a url property (non-empty string)
    return course && 
           typeof course === 'object' && 
           course.url && 
           typeof course.url === 'string' && 
           course.url.trim().length > 0;
  });
};

/**
 * Calculates total price for an array of courses
 * First filters valid courses, then calculates price based on count
 * 
 * @param {Array} courses - Array of course objects
 * @returns {Object} - Object containing validCourses array, validCount, and totalPrice
 */
const calculateOrderPrice = (courses) => {
  const validCourses = filterValidCourses(courses);
  const validCount = validCourses.length;
  const totalPrice = calculateTotalPrice(validCount);

  return {
    validCourses,
    validCount,
    totalPrice
  };
};

/**
 * Calculates unit price per course for combo orders
 * Rounds to nearest 1,000 VND
 * Formula: Math.round((TotalPrice / courseCount) / 1000) * 1000
 * 
 * @param {number} totalPrice - Total price for combo (e.g., PRICE_COMBO_5, PRICE_COMBO_10)
 * @param {number} courseCount - Number of courses (5 for Combo 5, 10 for Combo 10)
 * @returns {number} - Unit price per course rounded to nearest 1,000
 */
const calculateComboUnitPrice = (totalPrice, courseCount = 5) => {
  if (!totalPrice || !courseCount || courseCount <= 0) {
    return 0;
  }
  
  const unitPrice = totalPrice / courseCount;
  const roundedUnitPrice = Math.round(unitPrice / 1000) * 1000;
  
  Logger.debug('Calculated combo unit price', {
    totalPrice,
    courseCount,
    unitPrice,
    roundedUnitPrice
  });
  
  return roundedUnitPrice;
};

/**
 * Determines if a combo applies and calculates the unit price
 * Returns null if no combo applies, otherwise returns the calculated unit price
 * 
 * @param {number} validCourseCount - Number of valid courses
 * @param {number} totalPrice - Total price for the order
 * @returns {number|null} - Unit price if combo applies, null otherwise
 */
const getComboUnitPrice = (validCourseCount, totalPrice) => {
  const { PRICE_PER_COURSE, PRICE_COMBO_5, PRICE_COMBO_10 } = pricingConfig;
  
  // Check if combo applies
  if (validCourseCount === 5 && totalPrice === PRICE_COMBO_5) {
    return calculateComboUnitPrice(PRICE_COMBO_5, 5);
  }
  
  if (validCourseCount === 10 && totalPrice === PRICE_COMBO_10) {
    return calculateComboUnitPrice(PRICE_COMBO_10, 10);
  }
  
  // No combo applies
  return null;
};

module.exports = {
  calculateTotalPrice,
  filterValidCourses,
  calculateOrderPrice,
  calculateComboUnitPrice,
  getComboUnitPrice,
  pricingConfig
};
