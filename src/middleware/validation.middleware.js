/**
 * Validation middleware for request validation
 * @module middleware/validation
 */

/**
 * Validates email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validates order creation request
 */
const validateCreateOrder = (req, res, next) => {
  try {
    const { email, courses } = req.body;

    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Email không hợp lệ'
      });
    }

    if (!courses || !Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Danh sách khóa học không hợp lệ'
      });
    }

    // Validate each course
    for (const course of courses) {
      if (!course.url || typeof course.url !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'URL khóa học không hợp lệ'
        });
      }

      if (course.price !== undefined && (typeof course.price !== 'number' || course.price < 0)) {
        return res.status(400).json({
          success: false,
          message: 'Giá khóa học không hợp lệ'
        });
      }
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi xác thực dữ liệu'
    });
  }
};

/**
 * Validates webhook request
 * Supports both old format (transferContent, transferAmount) and new SePay format
 */
const validateWebhook = (req, res, next) => {
  try {
    // New SePay format: code/content and transferAmount
    // Old format: transferContent and transferAmount
    const { code, content, transferContent, transferAmount } = req.body;

    // Check if it's new format (has code or content) or old format (has transferContent)
    const hasNewFormat = (code && typeof code === 'string') || (content && typeof content === 'string');
    const hasOldFormat = transferContent && typeof transferContent === 'string';

    // Must have either new format fields or old format fields
    if (!hasNewFormat && !hasOldFormat) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin chuyển khoản (code/content hoặc transferContent)'
      });
    }

    // Validate transferAmount
    if (!transferAmount || isNaN(parseFloat(transferAmount)) || parseFloat(transferAmount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Số tiền không hợp lệ'
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi xác thực dữ liệu'
    });
  }
};

/**
 * Validates download request
 */
const validateDownload = (req, res, next) => {
  try {
    const { order_id, email, urls, courses } = req.body;
    const signature = req.headers['x-signature'];
    const timestamp = req.headers['x-timestamp'];

    if (!signature || !timestamp) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu chữ ký hoặc timestamp'
      });
    }

    if (!order_id) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu order_id'
      });
    }

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Email không hợp lệ'
      });
    }

    if ((!urls || !Array.isArray(urls) || urls.length === 0) &&
        (!courses || !Array.isArray(courses) || courses.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu danh sách khóa học'
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi xác thực dữ liệu'
    });
  }
};

/**
 * Validates enroll request
 */
const validateEnroll = (req, res, next) => {
  try {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Danh sách URL không hợp lệ'
      });
    }

    // Validate each URL
    for (const url of urls) {
      if (!url || typeof url !== 'string' || !url.includes('udemy.com')) {
        return res.status(400).json({
          success: false,
          message: 'URL không hợp lệ'
        });
      }
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi xác thực dữ liệu'
    });
  }
};

/**
 * Validates grant access request
 */
const validateGrantAccess = (req, res, next) => {
  try {
    const { order_id, email, courses } = req.body;

    if (!order_id) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu order_id'
      });
    }

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Email không hợp lệ'
      });
    }

    if (!courses || !Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Danh sách khóa học không hợp lệ'
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi xác thực dữ liệu'
    });
  }
};

/**
 * Validates webhook finalize request
 */
const validateWebhookFinalize = (req, res, next) => {
  try {
    const { secret_key, task_id, folder_name } = req.body;

    if (!secret_key || typeof secret_key !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Thiếu secret_key'
      });
    }

    if (!task_id || (typeof task_id !== 'number' && typeof task_id !== 'string')) {
      return res.status(400).json({
        success: false,
        message: 'Task ID không hợp lệ'
      });
    }

    if (!folder_name || typeof folder_name !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Tên folder không hợp lệ'
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi xác thực dữ liệu'
    });
  }
};

module.exports = {
  validateCreateOrder,
  validateWebhook,
  validateDownload,
  validateEnroll,
  validateGrantAccess,
  validateWebhookFinalize
};
