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
const { pricingConfig } = require('../utils/pricing.util');
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_CONCURRENT_REQUESTS = 3; // Limit concurrent requests

/**
 * Sleep utility for retry delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Check if error is retryable
 * @param {Error} error - The error to check
 * @returns {boolean}
 */
const isRetryableError = (error) => {
  if (!error) return false;
  
  // Network errors that can be retried
  const retryableNetworkErrors = [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ENETUNREACH'
  ];
  
  if (error.code && retryableNetworkErrors.includes(error.code)) {
    return true;
  }
  
  // HTTP status codes that can be retried
  const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
  if (error.response && retryableStatusCodes.includes(error.response.status)) {
    return true;
  }
  
  // Axios timeout errors
  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return true;
  }
  
  return false;
};

/**
 * Crawls a single course to get information with retry mechanism
 * @param {string} formattedUrl - Formatted Udemy course URL
 * @param {number} retryCount - Current retry attempt (for internal use)
 * @returns {Promise<Object>} - Course information with title, image, and courseId
 * @throws {AppError} - If crawling fails after all retries
 */
const crawlSingleCourse = async (formattedUrl, retryCount = 0) => {
  const targetUrl = formattedUrl.replace(
    /https?:\/\/udemy\.com/,
    'https://samsungu.udemy.com'
  );

  const config = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': formattedUrl,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Connection': 'keep-alive'
    },
    httpsAgent: new https.Agent({
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
      keepAlive: true
    }),
    timeout: 15000, // Increased to 15s
    maxRedirects: 5
  };

  try {
    Logger.debug('Attempting to crawl course', { 
      url: targetUrl, 
      attempt: retryCount + 1,
      maxRetries: MAX_RETRIES 
    });

    const response = await axios.get(targetUrl, config);

    if (response.status !== 200) {
      throw new AppError(`HTTP ${response.status}`, response.status);
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

    Logger.debug('Successfully crawled course', { 
      url: targetUrl, 
      title: title?.substring(0, 50),
      courseId,
      attempt: retryCount + 1
    });

    return { title, image, courseId };
  } catch (error) {
    // Don't retry AppErrors (business logic errors like 401, 404)
    if (error instanceof AppError) {
      Logger.warn('AppError while crawling (no retry)', { 
        url: formattedUrl, 
        message: error.message,
        statusCode: error.statusCode 
      });
      throw error;
    }

    // Check if we should retry
    const shouldRetry = isRetryableError(error) && retryCount < MAX_RETRIES - 1;
    
    if (shouldRetry) {
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount); // Exponential backoff
      Logger.warn('Retryable error, will retry', {
        url: formattedUrl,
        attempt: retryCount + 1,
        maxRetries: MAX_RETRIES,
        errorCode: error.code,
        statusCode: error.response?.status,
        retryDelay: delay,
        errorMessage: error.message
      });
      
      await sleep(delay);
      return crawlSingleCourse(formattedUrl, retryCount + 1);
    }

    // Final failure after all retries or non-retryable error
    Logger.error('Failed to crawl course after retries', {
      url: formattedUrl,
      attempts: retryCount + 1,
      errorCode: error.code,
      statusCode: error.response?.status,
      errorMessage: error.message
    });
    
    throw new AppError('Lỗi khi lấy thông tin khóa học', 500);
  }
};

/**
 * Process URLs with concurrency limit to avoid rate limiting
 * @param {Array<string>} urls - Array of URLs to process
 * @param {Function} processFn - Function to process each URL
 * @param {number} limit - Maximum concurrent requests
 * @returns {Promise<Array>} - Array of results
 */
const processConcurrently = async (urls, processFn, limit) => {
  const results = [];
  const executing = [];
  
  for (const [index, url] of urls.entries()) {
    const promise = processFn(url, index).then(result => {
      executing.splice(executing.indexOf(promise), 1);
      return result;
    });
    
    results.push(promise);
    executing.push(promise);
    
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }
  
  return Promise.all(results);
};

/**
 * Gets course information for multiple URLs with rate limiting and retry
 * @param {Array<string>} urls - Array of course URLs
 * @returns {Promise<Array>} - Array of course information objects
 */
const getCourseInfo = async (urls) => {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new AppError('Vui lòng truyền mảng urls.', 400);
  }

  Logger.info('Starting course info retrieval', { 
    totalUrls: urls.length,
    maxConcurrent: MAX_CONCURRENT_REQUESTS 
  });

  const startTime = Date.now();

  // Process URLs with concurrency limit
  const processFn = async (rawUrl, index) => {
    try {
      const formattedUrl = transformToSamsungUdemy(rawUrl);
      if (!formattedUrl) {
        Logger.warn('Invalid URL format', { url: rawUrl, index });
        return {
          success: false,
          url: rawUrl,
          message: 'URL không hợp lệ',
          price: 0
        };
      }

      Logger.debug('Processing course URL', { 
        url: formattedUrl, 
        index: index + 1,
        total: urls.length 
      });

      const data = await crawlSingleCourse(formattedUrl);

      if (data.courseId) {
        Logger.debug('Course processed successfully', { 
          url: rawUrl, 
          courseId: data.courseId,
          title: data.title?.substring(0, 50)
        });
        return {
          success: true,
          url: rawUrl,
          title: data.title,
          image: data.image,
          price: pricingConfig.PRICE_PER_COURSE,
          courseId: data.courseId
        };
      } else {
        Logger.warn('Course ID not found', { url: rawUrl });
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
      Logger.error('Error processing course URL', {
        url: rawUrl,
        errorMessage: error.message,
        errorCode: error.code,
        statusCode: error.statusCode || error.response?.status
      });
      return {
        success: false,
        url: rawUrl,
        message: error.message || 'Lỗi không xác định',
        price: 0
      };
    }
  };

  const results = await processConcurrently(urls, processFn, MAX_CONCURRENT_REQUESTS);
  
  const duration = Date.now() - startTime;
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  Logger.success('Course info retrieval completed', { 
    total: results.length,
    success: successCount,
    failed: failCount,
    durationMs: duration,
    avgTimePerCourse: Math.round(duration / results.length)
  });

  return results;
};

module.exports = {
  getCourseInfo
};
