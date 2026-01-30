require('dotenv').config();

const pricingConfig = {
  // Regular download pricing
  PRICE_PER_COURSE: parseInt(process.env.PRICE_PER_COURSE, 10) || 39000,
  PRICE_COMBO_5: parseInt(process.env.PRICE_COMBO_5, 10) || 99000,
  PRICE_COMBO_10: parseInt(process.env.PRICE_COMBO_10, 10) || 199000,

  // Premium All-Courses Offer pricing (fixed 199k)
  PREMIUM_PRICE: parseInt(process.env.PREMIUM_PRICE, 10) || 199000,
  ALL_COURSES_DRIVE_FOLDER: process.env.ALL_COURSES_DRIVE_FOLDER || 'https://drive.google.com/drive/folders/1uCinxTv0lXOQgsBfByTZCGEKu0bq-HRm'
};

module.exports = pricingConfig;
