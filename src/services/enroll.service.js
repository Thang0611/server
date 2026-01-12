/**
 * Enroll service for handling course enrollment business logic
 * @module services/enroll
 */

const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { transformToNormalizeUdemyCourseUrl } = require('../utils/url.util');
const DownloadTask = require('../models/downloadTask.model');
const Logger = require('../utils/logger.util');

// --- CẤU HÌNH ---
const ssSUBDOMAIN = 'samsungu.udemy.com';
const COOKIE_FILE_PATH = path.join(__dirname, '../../cookies.txt');

// --- HELPER FUNCTIONS ---

const getCookieFromFile = () => {
    try {
        if (!fs.existsSync(COOKIE_FILE_PATH)) throw new Error("⚠️ Không tìm thấy file cookies.txt");
        return fs.readFileSync(COOKIE_FILE_PATH, 'utf8').replace(/(\r\n|\n|\r)/gm, "").trim();
    } catch (err) {
        throw new Error(err.message);
    }
};

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * [UPDATE] Hàm lấy Course ID mạnh mẽ (Retry + Deep Regex + Anti-bot)
 */
const getCourseInfo = async (rawUrl, cookieString) => {
    const { gotScraping } = await import('got-scraping');

    let targetUrl = rawUrl.trim();

    // 1. Logic bảo vệ link SamsungU
    // Nếu là link doanh nghiệp, KHÔNG normalize về www.udemy.com
    if (!targetUrl.includes('samsungu.udemy.com')) {
         targetUrl = transformToNormalizeUdemyCourseUrl(targetUrl);
    }

    Logger.debug('Scraping course info', { targetUrl });

    // 2. Vòng lặp Retry (Thử lại tối đa 3 lần)
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            if (attempt > 1) {
                Logger.debug('Retrying course info fetch', { attempt, targetUrl });
                await wait(2000 * attempt); // Đợi 2s, 4s...
            }

            const response = await gotScraping({
                url: targetUrl,
                method: 'GET',
                http2: true, // Bật HTTP2 để giống trình duyệt thật
                headerGeneratorOptions: {
                    browsers: [{ name: 'chrome', minVersion: 110 }],
                    devices: ['desktop'],
                    operatingSystems: ['windows'],
                },
                headers: {
                    'Cookie': cookieString,
                    'Referer': targetUrl,
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache',
                    'Upgrade-Insecure-Requests': '1',
                },
                https: { rejectUnauthorized: false },
                retry: { limit: 0 }, // Tắt retry mặc định của thư viện để tự handle
                timeout: { request: 15000 } // Timeout 15s
            });

            // Nếu bị redirect về Login/SSO -> Cookie chết hoặc không có quyền -> Dừng ngay
            if (response.url.includes('login') || response.url.includes('sso')) {
                throw new Error("Cookie hết hạn hoặc không có quyền truy cập (Redirected to Login).");
            }

            const html = response.body;
            const $ = cheerio.load(html);
            let courseId = null;

            // --- CHIẾN THUẬT TÌM ID ---
            
            // Cách 1: Tìm trong Attributes (Udemy thường)
            courseId = $("body").attr("data-clp-course-id") || $("body").attr("data-course-id");

            // Cách 2: Tìm trong Scripts JSON (Udemy Business/SamsungU thường giấu ở đây)
            if (!courseId) {
                const regexList = [
                    /"courseId"\s*:\s*(\d+)/,          // "courseId": 12345
                    /"course_id"\s*:\s*(\d+)/,         // "course_id": 12345
                    /"id"\s*:\s*(\d+),\s*"title"/,     // "id": 12345, "title" (ID nằm cạnh Title)
                    /data-course-id="(\d+)"/,          // Attribute cũ
                    /course_id&quot;:(\d+)/            // HTML Encoded
                ];

                for (const regex of regexList) {
                    const match = html.match(regex);
                    if (match && match[1]) {
                        courseId = match[1];
                        // console.log(`   🔍 Found ID via Regex: ${regex}`); // Uncomment để debug
                        break;
                    }
                }
            }

            // Lấy Title
            let title = $('h1.ud-heading-xl').text().trim() || 
                        $('meta[property="og:title"]').attr('content') ||
                        $('title').text().replace('| Udemy', '').replace('| Udemy Business', '').trim();

            if (courseId) {
                return { 
                    courseId: parseInt(courseId), 
                    title: title || "Unknown Course Title" 
                };
            }

            // Nếu HTML trả về quá ngắn hoặc lạ -> Có thể bị chặn Anti-bot
            if (html.length < 5000) {
                throw new Error("HTML trả về quá ngắn (Anti-bot detected).");
            }

            throw new Error("Không tìm thấy Course ID trong HTML.");

        } catch (e) {
            lastError = e;
            // Nếu lỗi liên quan đến Cookie/Login thì throw luôn, không retry vô ích
            if (e.message.includes("Cookie") || e.message.includes("Login")) {
                throw e;
            }
            Logger.warn('Course info fetch attempt failed', { attempt, error: e.message, targetUrl });
        }
    }

    // Nếu hết 3 lần vẫn lỗi
    throw lastError;
};

/**
 * Gửi request Enroll khóa học
 */
const enrollByGet = async (courseId, cookieString, refererUrl) => {
    const { gotScraping } = await import('got-scraping');
    
    // URL Enroll cho SamsungU
    const subscribeUrl = `https://${ssSUBDOMAIN}/course/subscribe/?courseId=${courseId}`;
    
    const response = await gotScraping({
        url: subscribeUrl,
        method: 'GET',
        http2: true,
        followRedirect: true,
        headerGeneratorOptions: {
            browsers: [{ name: 'chrome', minVersion: 110 }],
            devices: ['desktop'],
            operatingSystems: ['windows'],
        },
        headers: {
            'Host': ssSUBDOMAIN,
            'Cookie': cookieString,
            'Referer': refererUrl,
        },
        https: { rejectUnauthorized: false }
    });

    return { statusCode: response.statusCode, finalUrl: response.url };
};

// --- MAIN SERVICE ---

const enrollCourses = async (urls, email) => {
    if (!email) throw new Error("Yêu cầu Email để cập nhật Database.");

    const cookieString = getCookieFromFile();
    const results = [];

    Logger.info('Starting enrollment', { email, count: urls.length });

    for (const rawUrl of urls) {
        try {
            // 1. Tìm Task trong DB (chỉ lấy các trường cần thiết)
            const task = await DownloadTask.findOne({
                where: { email: email, course_url: rawUrl },
                attributes: ['id', 'email', 'course_url', 'title', 'status']
            });

            if (!task) {
                Logger.warn('Task not found in database', { email, url: rawUrl });
                results.push({ success: false, url: rawUrl, message: 'Not found in DB' });
                continue;
            }

            Logger.debug('Processing enrollment task', { taskId: task.id, url: rawUrl });

            // 2. Lấy Info (Retry & Regex)
            const { courseId, title } = await getCourseInfo(rawUrl, cookieString);
            
            // 3. Enroll
            Logger.debug('Enrolling course', { courseId, title, taskId: task.id });
            const enrollResult = await enrollByGet(courseId, cookieString, rawUrl);

            const isSuccess = !enrollResult.finalUrl.includes("login") && !enrollResult.finalUrl.includes("sso");
            const finalStatus = isSuccess ? 'enrolled' : 'failed';

            // 4. Update DB (chỉ cập nhật các trường cần thiết)
            await DownloadTask.update(
                { title, status: finalStatus },
                {
                    where: { id: task.id },
                    fields: ['title', 'status']
                }
            );

            Logger.success('Enrollment completed', { taskId: task.id, status: finalStatus });

            results.push({
                success: isSuccess,
                url: rawUrl,
                courseId: courseId,
                title: title,
                db_id: task.id,
                status: finalStatus
            });

        } catch (err) {
            Logger.error('Enrollment failed', err, { url: rawUrl, email, taskId: task?.id });

            // Cập nhật trạng thái failed vào DB để không bị treo pending
            try {
                await DownloadTask.update(
                    { status: 'failed' },
                    {
                        where: { email, course_url: rawUrl },
                        fields: ['status']
                    }
                );
            } catch (e) {
                Logger.error('Failed to update task status to failed', e, { email, url: rawUrl });
            }

            results.push({
                success: false,
                url: rawUrl,
                status: 'error',
                message: err.message
            });
        }
        
        // Delay 3 giây giữa các khóa học để an toàn
        await wait(3000);
    }

    return results;
};

module.exports = {
    enrollCourses
};