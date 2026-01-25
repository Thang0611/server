/**
 * Cookie Validator Utility
 * Validates Udemy cookie validity by testing authentication
 * @module utils/cookieValidator
 */

const fs = require('fs');
const path = require('path');
const Logger = require('./logger.util');

const COOKIE_FILE_PATH = process.env.COOKIES_FILE || path.join(__dirname, '../../cookies.txt');

/**
 * Check if cookies.txt file exists and has content
 * @returns {Object} - { exists: boolean, hasContent: boolean, path: string }
 */
const checkCookieFile = () => {
  try {
    const exists = fs.existsSync(COOKIE_FILE_PATH);
    
    if (!exists) {
      return {
        exists: false,
        hasContent: false,
        path: COOKIE_FILE_PATH,
        error: 'Cookie file not found'
      };
    }

    const content = fs.readFileSync(COOKIE_FILE_PATH, 'utf8').trim();
    const hasContent = content.length > 0;

    return {
      exists: true,
      hasContent,
      path: COOKIE_FILE_PATH,
      contentLength: content.length,
      error: hasContent ? null : 'Cookie file is empty'
    };
  } catch (error) {
    Logger.error('[CookieValidator] Error checking cookie file', error);
    return {
      exists: false,
      hasContent: false,
      path: COOKIE_FILE_PATH,
      error: error.message
    };
  }
};

/**
 * Validate cookie by making a test request to Udemy
 * @returns {Promise<Object>} - { valid: boolean, message: string, details: Object }
 */
const validateCookie = async () => {
  try {
    // Check file first
    const fileCheck = checkCookieFile();
    if (!fileCheck.exists || !fileCheck.hasContent) {
      return {
        valid: false,
        message: fileCheck.error || 'Cookie file issue',
        details: fileCheck
      };
    }

    // Read cookie
    const cookieString = fs.readFileSync(COOKIE_FILE_PATH, 'utf8')
      .replace(/(\r\n|\n|\r)/gm, "")
      .trim();

    // Test cookie with a simple Udemy API request
    const { gotScraping } = await import('got-scraping');
    
    const testUrl = 'https://samsungu.udemy.com/api-2.0/users/me/';
    
    Logger.debug('[CookieValidator] Testing cookie validity', { testUrl });

    const response = await gotScraping({
      url: testUrl,
      method: 'GET',
      headers: {
        'Cookie': cookieString,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      https: { rejectUnauthorized: false },
      retry: { limit: 0 },
      timeout: { request: 10000 },
      throwHttpErrors: false
    });

    Logger.debug('[CookieValidator] Cookie test response', {
      statusCode: response.statusCode,
      redirected: response.url !== testUrl,
      finalUrl: response.url
    });

    // Check if redirected to login (indicates invalid cookie)
    if (response.url.includes('login') || response.url.includes('sso') || response.url.includes('auth')) {
      return {
        valid: false,
        message: 'Cookie đã hết hạn - Udemy redirect về login page',
        details: {
          statusCode: response.statusCode,
          redirectUrl: response.url,
          reason: 'REDIRECT_TO_LOGIN'
        }
      };
    }

    // Check status code
    if (response.statusCode === 401 || response.statusCode === 403) {
      return {
        valid: false,
        message: 'Cookie không hợp lệ - Unauthorized/Forbidden',
        details: {
          statusCode: response.statusCode,
          reason: 'UNAUTHORIZED'
        }
      };
    }

    // Check if response has valid user data
    if (response.statusCode === 200) {
      try {
        const data = JSON.parse(response.body);
        if (data && (data.id || data.email || data.display_name)) {
          return {
            valid: true,
            message: 'Cookie hợp lệ',
            details: {
              statusCode: response.statusCode,
              userId: data.id || null,
              email: data.email || null,
              displayName: data.display_name || null,
              reason: 'SUCCESS'
            }
          };
        }
      } catch (parseError) {
        Logger.warn('[CookieValidator] Failed to parse response', parseError);
      }
    }

    // Default: Consider invalid if we can't confirm validity
    return {
      valid: false,
      message: 'Không thể xác nhận cookie validity',
      details: {
        statusCode: response.statusCode,
        reason: 'UNKNOWN'
      }
    };

  } catch (error) {
    Logger.error('[CookieValidator] Error validating cookie', error);
    return {
      valid: false,
      message: `Lỗi khi kiểm tra cookie: ${error.message}`,
      details: {
        error: error.message,
        reason: 'ERROR'
      }
    };
  }
};

/**
 * Get cookie status (file check + validation)
 * @param {boolean} skipValidation - Skip actual cookie validation (just check file)
 * @returns {Promise<Object>} - Complete cookie status
 */
const getCookieStatus = async (skipValidation = false) => {
  const fileCheck = checkCookieFile();
  
  if (!fileCheck.exists || !fileCheck.hasContent) {
    return {
      fileStatus: fileCheck,
      validationResult: null,
      overallStatus: 'FILE_MISSING_OR_EMPTY'
    };
  }

  if (skipValidation) {
    return {
      fileStatus: fileCheck,
      validationResult: null,
      overallStatus: 'FILE_OK_VALIDATION_SKIPPED'
    };
  }

  const validationResult = await validateCookie();

  return {
    fileStatus: fileCheck,
    validationResult,
    overallStatus: validationResult.valid ? 'VALID' : 'INVALID'
  };
};

module.exports = {
  checkCookieFile,
  validateCookie,
  getCookieStatus
};
