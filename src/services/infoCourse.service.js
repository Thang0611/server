/**
 * Info course service for handling course information retrieval
 * @module services/infoCourse
 */

const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const { transformToSamsungUdemy } = require('../utils/url.util');
const Logger = require('../utils/logger.util');
const { AppError } = require('../middleware/errorHandler.middleware');

const PRICE_PER_COURSE = 2000;

/**
 * Crawls a single course to get information
 * @param {string} formattedUrl - Formatted Udemy course URL
 * @returns {Promise<Object>} - Course information with title, image, and courseId
 * @throws {AppError} - If crawling fails
 */
const crawlSingleCourse = async (formattedUrl) => {
  const targetUrl = formattedUrl.replace(
    /https?:\/\/udemy\.com/,
    'https://samsungu.udemy.com'
  );

  const config = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': formattedUrl
    },
    httpsAgent: new https.Agent({
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2'
    }),
    timeout: 15000
  };

  try {
    const response = await axios.get(targetUrl, config);

    if (response.status !== 200) {
      throw new AppError(`HTTP ${response.status}`, 500);
    }

    const html = response.data;
    const $ = cheerio.load(html);

    // Extract title
    let title =
      $('h1.clp-lead__title').text().trim() ||
      $('h1').text().trim() ||
      $('meta[property=\'og:title\']').attr('content');

    const image = $('meta[property=\'og:image\']').attr('content') || '';

    if (!title) {
      if (html.includes('Log In') || html.includes('Sign Up')) {
        throw new AppError('Trang yêu cầu đăng nhập (Không lấy được thông tin).', 401);
      }
      throw new AppError('Không tìm thấy tiêu đề khóa học.', 404);
    }

    // Extract course ID
    let courseId = null;
    courseId = $('body').attr('data-clp-course-id') || $('body').attr('data-course-id');

    if (!courseId) {
      const matchId = html.match(/"courseId"\s*:\s*(\d+)/);
      if (matchId) {
        courseId = matchId[1];
      }
    }

    if (!courseId) {
      const matchOld = html.match(/data-course-id="(\d+)"/);
      if (matchOld) {
        courseId = matchOld[1];
      }
    }

    if (courseId) {
      courseId = parseInt(courseId, 10);
    }

    return { title, image, courseId };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    Logger.error('Failed to crawl course', error, { url: formattedUrl });
    throw new AppError('Lỗi khi lấy thông tin khóa học', 500);
  }
};

/**
 * Gets course information for multiple URLs
 * @param {Array<string>} urls - Array of course URLs
 * @returns {Promise<Array>} - Array of course information objects
 */
const getCourseInfo = async (urls) => {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new AppError('Vui lòng truyền mảng urls.', 400);
  }

  // Process all URLs in parallel
  const promises = urls.map(async (rawUrl) => {
    try {
      const formattedUrl = transformToSamsungUdemy(rawUrl);
      if (!formattedUrl) {
        return {
          success: false,
          url: rawUrl,
          message: 'URL không hợp lệ',
          price: 0
        };
      }

      Logger.debug('Crawling course', { url: formattedUrl });
      const data = await crawlSingleCourse(formattedUrl);

      if (data.courseId) {
        return {
          success: true,
          url: rawUrl,
          title: data.title,
          image: data.image,
          price: PRICE_PER_COURSE,
          courseId: data.courseId
        };
      } else {
        return {
          success: false,
          url: rawUrl,
          title: 'Link bị lỗi hoặc cần đăng nhập',
          image: data.image || '',
          price: 0,
          courseId: null
        };
      }
    } catch (error) {
      Logger.error('Error processing course URL', error, { url: rawUrl });
      return {
        success: false,
        url: rawUrl,
        message: error.message || 'Lỗi không xác định',
        price: 0
      };
    }
  });

  const results = await Promise.all(promises);
  Logger.success('Course info retrieved', { count: results.length });

  return results;
};

module.exports = {
  getCourseInfo
};
