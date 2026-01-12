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






module.exports = { transformToSamsungUdemy ,transformToNormalizeUdemyCourseUrl};