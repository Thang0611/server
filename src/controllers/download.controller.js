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
  // Lấy signature và timestamp từ headers (dùng để verify request)
  // Signature được tạo bằng: HMAC-SHA256(order_id + email + timestamp, SECRET_KEY)
  const signature = req.headers['x-signature'];
  const timestamp = req.headers['x-timestamp'];
  const { order_id, email, urls, courses, phone_number } = req.body;

  // Validate: Kiểm tra các trường bắt buộc
  if (!signature || !timestamp || !order_id || !email) {
    throw new AppError('Thiếu thông tin bắt buộc', 400);
  }

  // Verify signature: Xác thực chữ ký để đảm bảo request hợp lệ
  // Ngăn chặn request giả mạo hoặc bị chỉnh sửa
  const isValid = downloadService.validateSignature(order_id, email, timestamp, signature);
  if (!isValid) {
    Logger.warn('Invalid signature in download request', { order_id });
    throw new AppError('Sai chữ ký bảo mật', 403);
  }

  // Normalize input: Chuẩn hóa input courses/urls
  // Hỗ trợ 2 format:
  //   1. courses: [{ url: "...", title: "...", price: ... }]
  //   2. urls: ["url1", "url2"] (legacy format)
  let inputCourses = [];
  if (Array.isArray(courses)) {
    inputCourses = courses;
  } else if (Array.isArray(urls)) {
    // Convert legacy format sang object format
    inputCourses = urls.map(url => ({ url }));
  }

  // Tạo download tasks: Mỗi course sẽ tạo 1 task trong database
  // Tasks được tạo với status = 'pending', chờ thanh toán
  const { tasks, uniqueUrls, count } = await downloadService.createDownloadTasks(
    order_id,
    email,
    inputCourses,
    phone_number
  );

  // Response: Trả về thông tin tasks đã tạo
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