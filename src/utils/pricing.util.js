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
 * Returns exact unit price without rounding (e.g., 39,800 VND)
 * 
 * NOTE: This returns the exact unit price. Use distributeComboPrices() to get
 * accurate prices for each course that sum exactly to totalPrice.
 * 
 * @param {number} totalPrice - Total price for combo (e.g., PRICE_COMBO_5, PRICE_COMBO_10)
 * @param {number} courseCount - Number of courses (5 for Combo 5, 10 for Combo 10)
 * @returns {number} - Exact unit price per course (no rounding)
 */
const calculateComboUnitPrice = (totalPrice, courseCount = 5) => {
  if (!totalPrice || !courseCount || courseCount <= 0) {
    return 0;
  }
  
  const unitPrice = totalPrice / courseCount;
  
  Logger.debug('Calculated combo exact unit price', {
    totalPrice,
    courseCount,
    unitPrice
  });
  
  return unitPrice;
};

/**
 * Distributes combo price across courses so total equals exactly totalPrice
 * Uses exact unit price (no rounding), last course gets remainder if needed
 * 
 * Example: Combo 5 = 199,000 VND
 * - Exact unit price: 199000/5 = 39,800
 * - If divisible: All courses get 39,800 each
 * - If not divisible: First N-1 courses get exact unit price, last course gets remainder
 * 
 * @param {number} totalPrice - Total price for combo (e.g., PRICE_COMBO_5, PRICE_COMBO_10)
 * @param {number} courseCount - Number of courses (5 for Combo 5, 10 for Combo 10)
 * @returns {Array<number>} - Array of prices for each course, sum equals totalPrice exactly
 */
const distributeComboPrices = (totalPrice, courseCount) => {
  if (!totalPrice || !courseCount || courseCount <= 0) {
    return [];
  }

  // Calculate exact unit price (no rounding)
  const exactUnitPrice = totalPrice / courseCount;
  
  // Check if price is evenly divisible
  const isEvenlyDivisible = (totalPrice % courseCount) === 0;
  
  if (isEvenlyDivisible) {
    // All courses get the same exact price
    const prices = new Array(courseCount).fill(exactUnitPrice);
    
    Logger.debug('Distributed combo prices (evenly divisible)', {
      totalPrice,
      courseCount,
      exactUnitPrice,
      prices,
      sum: prices.reduce((sum, price) => sum + price, 0)
    });
    
    return prices;
  } else {
    // Not evenly divisible: first N-1 courses get exact unit price (rounded down if needed)
    // Last course gets remainder to ensure exact total
    const coursesWithBasePrice = courseCount - 1;
    // Use Math.floor to get integer prices for first N-1 courses
    const basePrice = Math.floor(exactUnitPrice);
    const basePriceTotal = basePrice * coursesWithBasePrice;
    const lastCoursePrice = totalPrice - basePriceTotal;
    
    // Build array: first N-1 courses get basePrice, last course gets remainder
    const prices = new Array(courseCount).fill(basePrice);
    prices[courseCount - 1] = lastCoursePrice;
    
    // Verify sum equals totalPrice (safety check)
    const calculatedTotal = prices.reduce((sum, price) => sum + price, 0);
    if (calculatedTotal !== totalPrice) {
      Logger.warn('Price distribution mismatch', {
        totalPrice,
        calculatedTotal,
        difference: calculatedTotal - totalPrice,
        prices
      });
    }
    
    Logger.debug('Distributed combo prices (with remainder)', {
      totalPrice,
      courseCount,
      exactUnitPrice,
      basePrice,
      lastCoursePrice,
      prices,
      sum: calculatedTotal
    });
    
    return prices;
  }
};

/**
 * Determines if a combo applies and calculates the unit price
 * Returns null if no combo applies, otherwise returns the base unit price
 * 
 * NOTE: For accurate per-course pricing, use getComboPriceDistribution() instead
 * 
 * @param {number} validCourseCount - Number of valid courses
 * @param {number} totalPrice - Total price for the order
 * @returns {number|null} - Base unit price if combo applies, null otherwise
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

/**
 * Determines if a combo applies and returns price distribution for each course
 * Returns null if no combo applies, otherwise returns array of prices
 * 
 * @param {number} validCourseCount - Number of valid courses
 * @param {number} totalPrice - Total price for the order
 * @returns {Array<number>|null} - Array of prices for each course if combo applies, null otherwise
 */
const getComboPriceDistribution = (validCourseCount, totalPrice) => {
  const { PRICE_COMBO_5, PRICE_COMBO_10 } = pricingConfig;
  
  // Check if combo applies
  if (validCourseCount === 5 && totalPrice === PRICE_COMBO_5) {
    return distributeComboPrices(PRICE_COMBO_5, 5);
  }
  
  if (validCourseCount === 10 && totalPrice === PRICE_COMBO_10) {
    return distributeComboPrices(PRICE_COMBO_10, 10);
  }
  
  // No combo applies
  return null;
};

module.exports = {
  calculateTotalPrice,
  filterValidCourses,
  calculateOrderPrice,
  calculateComboUnitPrice,
  distributeComboPrices,
  getComboUnitPrice,
  getComboPriceDistribution,
  pricingConfig
};
