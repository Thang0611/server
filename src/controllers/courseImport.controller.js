/**
 * Course Import Controller
 * Controller để xử lý import courses từ URLs
 * @module controllers/courseImport
 */

const courseImportService = require('../services/courseImport.service');
const { asyncHandler } = require('../middleware/errorHandler.middleware');
const { validateCourseUrls } = require('../crawler/urlValidator');
const Logger = require('../utils/logger.util');

/**
 * POST /api/v1/courses/import
 * Import courses from URLs
 * Body: { urls: string[], shouldDownload: boolean }
 */
const importCourses = asyncHandler(async (req, res, next) => {
  const { urls, shouldDownload = false } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Vui lòng cung cấp danh sách URL hợp lệ'
    });
  }

  // Validate and sanitize URLs
  const { valid, invalid } = validateCourseUrls(urls);
  
  if (invalid.length > 0) {
    Logger.warn('Invalid URLs provided', { invalid });
    return res.status(400).json({
      success: false,
      error: 'Một số URL không hợp lệ',
      invalidUrls: invalid
    });
  }
  
  if (valid.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Không có URL hợp lệ nào'
    });
  }

  Logger.info('Course import request received', { 
    originalUrlCount: urls.length,
    validUrlCount: valid.length,
    shouldDownload 
  });

  // Use validated and sanitized URLs
  const result = await courseImportService.importCourses(valid, shouldDownload);

  res.json({
    success: true,
    message: `Đã xử lý ${result.total} khóa học: ${result.imported} mới, ${result.updated} cập nhật, ${result.failed} lỗi`,
    ...result
  });
});

module.exports = {
  importCourses
};
