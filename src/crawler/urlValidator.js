/**
 * URL Validator and Sanitizer
 * Validates and sanitizes URLs for security
 * @module crawler/urlValidator
 */

const { URL } = require('url');

/**
 * Allowed domains for course URLs
 */
const ALLOWED_DOMAINS = [
  'www.udemy.com',
  'udemy.com',
  'samsungu.udemy.com'
];

/**
 * Maximum URL length
 */
const MAX_URL_LENGTH = 2048;

/**
 * Validate and sanitize course URL
 * @param {string} url - Course URL to validate
 * @returns {Object} - { valid: boolean, sanitized: string, error: string }
 */
function validateCourseUrl(url) {
  if (!url || typeof url !== 'string') {
    return {
      valid: false,
      sanitized: null,
      error: 'URL must be a non-empty string'
    };
  }

  // Trim whitespace
  const trimmedUrl = url.trim();

  // Check length
  if (trimmedUrl.length > MAX_URL_LENGTH) {
    return {
      valid: false,
      sanitized: null,
      error: `URL exceeds maximum length of ${MAX_URL_LENGTH} characters`
    };
  }

  // Check if it's a valid URL format
  let parsedUrl;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch (error) {
    return {
      valid: false,
      sanitized: null,
      error: 'Invalid URL format'
    };
  }

  // Check protocol (must be http or https)
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return {
      valid: false,
      sanitized: null,
      error: 'URL must use http or https protocol'
    };
  }

  // Check domain
  const hostname = parsedUrl.hostname.toLowerCase();
  const isAllowedDomain = ALLOWED_DOMAINS.some(domain => 
    hostname === domain || hostname.endsWith('.' + domain)
  );

  if (!isAllowedDomain) {
    return {
      valid: false,
      sanitized: null,
      error: `Domain not allowed. Allowed domains: ${ALLOWED_DOMAINS.join(', ')}`
    };
  }

  // Check if path contains /course/
  if (!parsedUrl.pathname.includes('/course/')) {
    return {
      valid: false,
      sanitized: null,
      error: 'URL must be a course URL (contain /course/)'
    };
  }

  // Sanitize: remove query params and fragments (keep only path)
  const sanitized = `${parsedUrl.protocol}//${parsedUrl.hostname}${parsedUrl.pathname}`;

  return {
    valid: true,
    sanitized,
    error: null
  };
}

/**
 * Validate multiple URLs
 * @param {Array<string>} urls - Array of URLs to validate
 * @returns {Object} - { valid: Array, invalid: Array<{url, error}> }
 */
function validateCourseUrls(urls) {
  if (!Array.isArray(urls)) {
    return {
      valid: [],
      invalid: [{ url: null, error: 'URLs must be an array' }]
    };
  }

  const valid = [];
  const invalid = [];

  urls.forEach((url, index) => {
    const validation = validateCourseUrl(url);
    if (validation.valid) {
      valid.push(validation.sanitized);
    } else {
      invalid.push({
        url: url || `[index ${index}]`,
        error: validation.error
      });
    }
  });

  return { valid, invalid };
}

module.exports = {
  validateCourseUrl,
  validateCourseUrls,
  ALLOWED_DOMAINS,
  MAX_URL_LENGTH
};
