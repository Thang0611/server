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

    // Chỉ chấp nhận udemy.com
    if (!/(^|\.)udemy\.com$/.test(url.hostname)) {
      return null;
    }

    // Ép domain & protocol chuẩn
    url.hostname = 'udemy.com';
    url.protocol = 'https:';

    // Validate path
    const match = url.pathname.match(/^\/course\/([a-zA-Z0-9-_]+)\/?/);
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

    // Chỉ xử lý udemy.com
    if (!/(^|\.)udemy\.com$/.test(url.hostname)) {
      return null;
    }

    // Ép về Udemy Business tenant
    url.hostname = 'samsungu.udemy.com';
    url.protocol = 'https:';

    // Validate /course/<slug>/
    const match = url.pathname.match(/^\/course\/([a-zA-Z0-9-_]+)\/?/);
    if (!match) return null;

    const slug = match[1];

    // Chuẩn hoá path
    url.pathname = `/course/${slug}/`;
    url.search = '';
    url.hash = '';

    return url.toString();
  } catch {
    return null;
  }
}






module.exports = { transformToSamsungUdemy ,transformToNormalizeUdemyCourseUrl};