// src/services/enroll.service.js
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { transformToNormalizeUdemyCourseUrl } = require('../utils/url.util');

// Cấu hình đường dẫn
const SUBDOMAIN = 'udemy.com';
const ssSUBDOMAIN = 'samsungu.udemy.com';
// Lưu ý: Kiểm tra lại đường dẫn file cookie cho đúng cấu trúc thư mục của bạn
const COOKIE_FILE_PATH = path.join(__dirname, '../../cookies.txt');

// --- Helper Functions ---
const getCookieFromFile = () => {
    try {
        if (!fs.existsSync(COOKIE_FILE_PATH)) throw new Error("⚠️ Chưa tạo file cookie.txt");
        return fs.readFileSync(COOKIE_FILE_PATH, 'utf8').replace(/(\r\n|\n|\r)/gm, "").trim();
    } catch (err) {
        throw new Error(err.message);
    }
};

// Hàm lấy Course ID (Internal)
const getCourseId = async (rawUrl, cookieString) => {
    const { gotScraping } = await import('got-scraping'); // Dynamic Import

    let formattedUrl = rawUrl.trim();
    console.log(rawUrl)

    const targetUrl = transformToNormalizeUdemyCourseUrl(formattedUrl);
    console.log(targetUrl)
    console.log("👉 Lấy Course ID từ URL:", targetUrl);
    const response = await gotScraping({
        url: targetUrl,
        method: 'GET',
        http2: false,
        headerGeneratorOptions: {
            browsers: [{ name: 'firefox', minVersion: 100 }],
            devices: ['desktop'],
            operatingSystems: ['windows'],
        },
        headers: {
            'Cookie': cookieString,
            'Referer': formattedUrl,
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
        },
        https: { rejectUnauthorized: false },
        retry: { limit: 2 }
    });

    const html = response.body;
    const $ = cheerio.load(html);
    
    let courseId = $("body").attr("data-clp-course-id") || $("body").attr("data-course-id");
    if (!courseId) {
        const matchId = html.match(/"courseId"\s*:\s*(\d+)/);
        if (matchId) courseId = matchId[1];
    }
    if (!courseId) {
        const matchOld = html.match(/data-course-id="(\d+)"/);
        if (matchOld) courseId = matchOld[1];
    }

    if (!courseId) {
        if (html.includes('Login') || response.url.includes('login')) {
            throw new Error("Bị redirect về Login (Cookie lỗi).");
        }
        throw new Error("Không lấy được Course ID.");
    }
    return parseInt(courseId);
};

// Hàm Enroll (Internal)
const enrollByGet = async (courseId, cookieString, refererUrl) => {
    const { gotScraping } = await import('got-scraping');
    const subscribeUrl = `https://${ssSUBDOMAIN}/course/subscribe/?courseId=${courseId}`;
    
    const response = await gotScraping({
        url: subscribeUrl,
        method: 'GET',
        http2: false,
        followRedirect: true,
        headerGeneratorOptions: {
            browsers: [{ name: 'firefox', minVersion: 100 }],
            devices: ['desktop'],
            operatingSystems: ['windows'],
        },
        headers: {
            'Host': ssSUBDOMAIN,
            'Cookie': cookieString,
            'Referer': refererUrl || `https://${ssSUBDOMAIN}/`,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Upgrade-Insecure-Requests': '1',
        },
        https: { rejectUnauthorized: false }
    });

    return { statusCode: response.statusCode, finalUrl: response.url };
};

// --- MAIN SERVICE FUNCTION ---
/**
 * Nhận vào mảng URLs, thực hiện enroll và trả về kết quả
 * @param {Array<string>} urls - Danh sách link Udemy
 * @returns {Promise<Array>} - Kết quả từng link
 */
const enrollCourses = async (urls) => {
    const cookieString = getCookieFromFile();
    const results = [];

    console.log(`\n🔄 [Service] Bắt đầu Enroll ${urls.length} khóa học...`);

    for (const rawUrl of urls) {
        try {
            // B1: Lấy ID
            const courseId = await getCourseId(rawUrl, cookieString);
            
            // B2: Enroll
            console.log(`⏳ ID: ${courseId} | Đang enroll...`);
            const enrollResult = await enrollByGet(courseId, cookieString, rawUrl);

            const isSuccess = !enrollResult.finalUrl.includes("login") && !enrollResult.finalUrl.includes("sso");
            
            results.push({
                success: isSuccess,
                url: rawUrl,
                courseId: courseId,
                status: isSuccess ? 'enrolled' : 'failed'
            });

        } catch (err) {
            console.error(`❌ [Enroll Error] ${rawUrl}: ${err.message}`);
            // Mặc định trả về success=false để controller biết xử lý
            results.push({
                success: false,
                url: rawUrl,
                status: 'error',
                message: err.message
            });
        }
        // Delay 2s tránh spam
        await new Promise(r => setTimeout(r, 2000));
    }

    return results;
};

module.exports = {
    enrollCourses
};