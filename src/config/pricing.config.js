require('dotenv').config();

const pricingConfig = {
  PRICE_PER_COURSE: parseInt(process.env.PRICE_PER_COURSE, 10) || 50000,
  PRICE_COMBO_5: parseInt(process.env.PRICE_COMBO_5, 10) || 199000,
  PRICE_COMBO_10: parseInt(process.env.PRICE_COMBO_10, 10) || 299000
};

module.exports = pricingConfig;
