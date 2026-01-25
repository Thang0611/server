const transformUrl = (originalUrl) => {
    if (!originalUrl.includes('udemy.com')) return null;
    if (originalUrl.includes('www.samsungu.udemy.com')) return originalUrl;
    return originalUrl.replace('udemy.com', 'samsungu.udemy.com');
};

function transformToNormalizeUdemyCourseUrl(rawUrl) {
  try {
    const url = new URL(
      /^https?:\/\//i.test(rawUrl) ? rawUrl.trim() : `https://${rawUrl.trim()}`
    );

    // Chỉ chấp nhận udemy.com (bao gồm cả samsungu.udemy.com)
    if (!/(^|\.)udemy\.com$/.test(url.hostname)) {
      return null;
    }

    // Ép domain & protocol chuẩn
    url.hostname = 'udemy.com';
    url.protocol = 'https:';

    // Validate và extract course slug từ nhiều format:
    // - /course/<slug>/
    // - /course/<slug>/learn/lecture/...
    // - /course/<slug>/learn/quiz/...
    // - /course/<slug>/learn/practice/...
    // - Các path khác sau course slug
    const match = url.pathname.match(/^\/course\/([a-zA-Z0-9-_]+)(?:\/.*)?$/);
    if (!match) return null;

    const slug = match[1];

    url.pathname = `/course/${slug}/`;
    url.search = '';
    url.hash = '';

    return url.toString();
  } catch {
    return null;
  }
}



function transformToSamsungUdemy(rawUrl) {
  try {
    const url = new URL(
      /^https?:\/\//i.test(rawUrl) ? rawUrl.trim() : `https://${rawUrl.trim()}`
    );

    // Chỉ xử lý udemy.com (bao gồm cả samsungu.udemy.com)
    if (!/(^|\.)udemy\.com$/.test(url.hostname)) {
      return null;
    }

    // Ép về Udemy Business tenant
    url.hostname = 'samsungu.udemy.com';
    url.protocol = 'https:';

    // Validate và extract course slug từ nhiều format:
    // - /course/<slug>/
    // - /course/<slug>/learn/lecture/...
    // - /course/<slug>/learn/quiz/...
    // - /course/<slug>/learn/practice/...
    // - Các path khác sau course slug
    const match = url.pathname.match(/^\/course\/([a-zA-Z0-9-_]+)(?:\/.*)?$/);
    if (!match) return null;

    const slug = match[1];

    // Chuẩn hoá path về course URL (bỏ phần /learn/lecture/...)
    url.pathname = `/course/${slug}/`;
    url.search = '';
    url.hash = '';

    return url.toString();
  } catch {
    return null;
  }
}






/**
 * Extract slug from Udemy course URL
 * @param {string} url - Course URL
 * @returns {string|null} - Course slug or null if invalid
 */
function extractSlugFromUrl(url) {
  try {
    if (!url) return null;
    
    const urlObj = new URL(
      /^https?:\/\//i.test(url) ? url.trim() : `https://${url.trim()}`
    );

    // Extract slug from /course/<slug>/
    const match = urlObj.pathname.match(/^\/course\/([a-zA-Z0-9-_]+)(?:\/.*)?$/);
    if (match && match[1]) {
      return match[1];
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Generate slug from title (fallback if URL doesn't have slug)
 * @param {string} title - Course title
 * @returns {string} - Generated slug
 */
function generateSlugFromTitle(title) {
  if (!title) return '';
  
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .substring(0, 200); // Limit length
}

module.exports = { 
  transformToSamsungUdemy,
  transformToNormalizeUdemyCourseUrl,
  extractSlugFromUrl,
  generateSlugFromTitle
};