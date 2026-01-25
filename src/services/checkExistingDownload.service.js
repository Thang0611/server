/**
 * Service to check if a course has already been downloaded
 * Only checks for PERMANENT courses (temporary courses are always re-downloaded)
 * @module services/checkExistingDownload
 */

const DownloadTask = require('../models/downloadTask.model');
const Course = require('../models/course.model');
const Logger = require('../utils/logger.util');
const { Op } = require('sequelize');
const { transformToSamsungUdemy, transformToNormalizeUdemyCourseUrl } = require('../utils/url.util');

/**
 * Kiểm tra xem khóa học PERMANENT đã được download chưa (có drive_link)
 * Chỉ kiểm tra các khóa học permanent - temporary courses luôn phải download lại
 * @param {string} courseUrl - URL của khóa học
 * @param {string} courseType - Loại khóa học: 'temporary' hoặc 'permanent'
 * @returns {Promise<Object|null>} - Task đã completed với drive_link hoặc null
 */
const checkExistingDownload = async (courseUrl, courseType = 'temporary') => {
  try {
    // Chỉ kiểm tra existing download cho PERMANENT courses
    // Temporary courses luôn phải download lại (không reuse)
    if (courseType !== 'permanent') {
      Logger.debug('Skipping existing download check for temporary course', {
        courseUrl,
        courseType
      });
      return null;
    }

    // Normalize URL để so sánh (chuyển về samsungu.udemy.com format)
    const normalizedUrl = transformToSamsungUdemy(courseUrl);
    if (!normalizedUrl) {
      Logger.warn('Failed to normalize course URL', { courseUrl });
      return null;
    }

    // STEP 1: Tìm trong download_tasks (ưu tiên)
    // Tìm với cả normalized URL và original URL để cover các trường hợp
    const existingTask = await DownloadTask.findOne({
      where: {
        [Op.or]: [
          { course_url: normalizedUrl },
          { course_url: courseUrl }
        ],
        status: 'completed',
        course_type: 'permanent', // Chỉ tìm permanent courses
        drive_link: { [Op.ne]: null }
      },
      attributes: ['id', 'drive_link', 'title', 'course_type', 'category'],
      order: [['updated_at', 'DESC']] // Lấy task mới nhất
    });

    if (existingTask && existingTask.drive_link) {
      Logger.info('Found existing permanent download in download_tasks', {
        courseUrl,
        taskId: existingTask.id,
        hasDriveLink: !!existingTask.drive_link,
        courseType: existingTask.course_type
      });
      return existingTask;
    }

    // STEP 2: Nếu không tìm thấy trong download_tasks, tìm trong courses table
    // Tìm với cả normalized URL và original URL
    const existingCourse = await Course.findOne({
      where: {
        [Op.or]: [
          { course_url: normalizedUrl },
          { course_url: courseUrl }
        ],
        drive_link: { [Op.ne]: null }
      },
      attributes: ['id', 'drive_link', 'title', 'course_url'],
      order: [['updated_at', 'DESC']] // Lấy course mới nhất
    });

    if (existingCourse && existingCourse.drive_link) {
      Logger.info('Found existing permanent download in courses table', {
        courseUrl,
        courseId: existingCourse.id,
        hasDriveLink: !!existingCourse.drive_link
      });
      // Return format tương tự như DownloadTask để code xử lý giống nhau
      return {
        id: existingCourse.id,
        drive_link: existingCourse.drive_link,
        title: existingCourse.title,
        course_type: 'permanent',
        category: null
      };
    }

    Logger.debug('No existing permanent download found', {
      courseUrl,
      courseType
    });
    return null;
  } catch (error) {
    Logger.error('Error checking existing download', error, { courseUrl, courseType });
    return null;
  }
};

module.exports = { checkExistingDownload };
