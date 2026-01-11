// // src/services/enroll.service.js
// const cheerio = require('cheerio');
// const fs = require('fs');
// const path = require('path');
// const { URL } = require('url');
// const { transformToNormalizeUdemyCourseUrl } = require('../utils/url.util');

// // Cấu hình đường dẫn
// const SUBDOMAIN = 'udemy.com';
// const ssSUBDOMAIN = 'samsungu.udemy.com';
// // Lưu ý: Kiểm tra lại đường dẫn file cookie cho đúng cấu trúc thư mục của bạn
// const COOKIE_FILE_PATH = path.join(__dirname, '../../cookies.txt');

// // --- Helper Functions ---
// const getCookieFromFile = () => {
//     try {
//         if (!fs.existsSync(COOKIE_FILE_PATH)) throw new Error("⚠️ Chưa tạo file cookie.txt");
//         return fs.readFileSync(COOKIE_FILE_PATH, 'utf8').replace(/(\r\n|\n|\r)/gm, "").trim();
//     } catch (err) {
//         throw new Error(err.message);
//     }
// };

// // Hàm lấy Course ID (Internal)
// const getCourseInfo = async (rawUrl, cookieString) => {
//     const { gotScraping } = await import('got-scraping'); // Dynamic Import

//     let formattedUrl = rawUrl.trim();
//     console.log(rawUrl)

//     const targetUrl = transformToNormalizeUdemyCourseUrl(formattedUrl);
//     console.log(targetUrl)
//     console.log("👉 Lấy Course ID từ URL:", targetUrl);
//     const response = await gotScraping({
//         url: targetUrl,
//         method: 'GET',
//         http2: false,
//         headerGeneratorOptions: {
//             browsers: [{ name: 'firefox', minVersion: 100 }],
//             devices: ['desktop'],
//             operatingSystems: ['windows'],
//         },
//         headers: {
//             'Cookie': cookieString,
//             'Referer': formattedUrl,
//             'Upgrade-Insecure-Requests': '1',
//             'Sec-Fetch-Dest': 'document',
//             'Sec-Fetch-Mode': 'navigate',
//             'Sec-Fetch-Site': 'same-origin',
//         },
//         https: { rejectUnauthorized: false },
//         retry: { limit: 2 }
//     });

//     const html = response.body;
//     const $ = cheerio.load(html);
    
//     let courseId = $("body").attr("data-clp-course-id") || $("body").attr("data-course-id");
//     if (!courseId) {
//         const matchId = html.match(/"courseId"\s*:\s*(\d+)/);
//         if (matchId) courseId = matchId[1];
//     }
//     if (!courseId) {
//         const matchOld = html.match(/data-course-id="(\d+)"/);
//         if (matchOld) courseId = matchOld[1];
//     }

//     if (!courseId) {
//         if (html.includes('Login') || response.url.includes('login')) {
//             throw new Error("Bị redirect về Login (Cookie lỗi).");
//         }
//         throw new Error("Không lấy được Course ID.");
//     }
//     return parseInt(courseId);
// };

// // Hàm Enroll (Internal)
// const enrollByGet = async (courseId, cookieString, refererUrl) => {
//     const { gotScraping } = await import('got-scraping');
//     const subscribeUrl = `https://${ssSUBDOMAIN}/course/subscribe/?courseId=${courseId}`;
    
//     const response = await gotScraping({
//         url: subscribeUrl,
//         method: 'GET',
//         http2: false,
//         followRedirect: true,
//         headerGeneratorOptions: {
//             browsers: [{ name: 'firefox', minVersion: 100 }],
//             devices: ['desktop'],
//             operatingSystems: ['windows'],
//         },
//         headers: {
//             'Host': ssSUBDOMAIN,
//             'Cookie': cookieString,
//             'Referer': refererUrl || `https://${ssSUBDOMAIN}/`,
//             'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
//             'Upgrade-Insecure-Requests': '1',
//         },
//         https: { rejectUnauthorized: false }
//     });

//     return { statusCode: response.statusCode, finalUrl: response.url };
// };

// // --- MAIN SERVICE FUNCTION ---
// /**
//  * Nhận vào mảng URLs, thực hiện enroll và trả về kết quả
//  * @param {Array<string>} urls - Danh sách link Udemy
//  * @returns {Promise<Array>} - Kết quả từng link
//  */
// const enrollCourses = async (urls) => {
//     const cookieString = getCookieFromFile();
//     const results = [];

//     console.log(`\n🔄 [Service] Bắt đầu Enroll ${urls.length} khóa học...`);

//     for (const rawUrl of urls) {
//         try {
//             // B1: Lấy ID
//             const courseId = await getCourseInfo(rawUrl, cookieString);
            
//             // B2: Enroll
//             console.log(`⏳ ID: ${courseId} | Đang enroll...`);
//             const enrollResult = await enrollByGet(courseId, cookieString, rawUrl);

//             const isSuccess = !enrollResult.finalUrl.includes("login") && !enrollResult.finalUrl.includes("sso");
            
//             results.push({
//                 success: isSuccess,
//                 url: rawUrl,
//                 courseId: courseId,
//                 status: isSuccess ? 'enrolled' : 'failed'
//             });

//         } catch (err) {
//             console.error(`❌ [Enroll Error] ${rawUrl}: ${err.message}`);
//             // Mặc định trả về success=false để controller biết xử lý
//             results.push({
//                 success: false,
//                 url: rawUrl,
//                 status: 'error',
//                 message: err.message
//             });
//         }
//         // Delay 2s tránh spam
//         await new Promise(r => setTimeout(r, 2000));
//     }

//     return results;
// };

// module.exports = {
//     enrollCourses
// };



// src/services/enroll.service.js
// const cheerio = require('cheerio');
// const fs = require('fs');
// const path = require('path');
// const { transformToNormalizeUdemyCourseUrl } = require('../utils/url.util');
// const DownloadTask = require('../models/downloadTask.model'); // Đảm bảo đường dẫn trỏ đúng Model Sequelize của bạn

// // --- CẤU HÌNH ---
// const SUBDOMAIN = 'udemy.com';
// const ssSUBDOMAIN = 'samsungu.udemy.com';
// const COOKIE_FILE_PATH = path.join(__dirname, '../../cookies.txt');

// // --- HELPER FUNCTIONS ---

// /**
//  * Đọc cookie từ file text
//  */
// const getCookieFromFile = () => {
//     try {
//         if (!fs.existsSync(COOKIE_FILE_PATH)) throw new Error("⚠️ Không tìm thấy file cookies.txt");
//         return fs.readFileSync(COOKIE_FILE_PATH, 'utf8').replace(/(\r\n|\n|\r)/gm, "").trim();
//     } catch (err) {
//         throw new Error(err.message);
//     }
// };

// /**
//  * Lấy ID và Title của khóa học từ Udemy
//  */
// const getCourseInfo = async (rawUrl, cookieString) => {
//     // Dynamic import vì got-scraping là ESM
//     const { gotScraping } = await import('got-scraping');

//     let formattedUrl = rawUrl.trim();
//     const targetUrl = transformToNormalizeUdemyCourseUrl(formattedUrl);
    
//     console.log("👉 [Scraping] Lấy info từ:", targetUrl);
    
//     const response = await gotScraping({
//         url: targetUrl,
//         method: 'GET',
//         http2: false,
//         headerGeneratorOptions: {
//             browsers: [{ name: 'firefox', minVersion: 100 }],
//             devices: ['desktop'],
//             operatingSystems: ['windows'],
//         },
//         headers: {
//             'Cookie': cookieString,
//             'Referer': formattedUrl,
//             'Upgrade-Insecure-Requests': '1',
//         },
//         https: { rejectUnauthorized: false },
//         retry: { limit: 2 }
//     });

//     const html = response.body;
//     const $ = cheerio.load(html);
    
//     // 1. Logic lấy Course ID
//     let courseId = $("body").attr("data-clp-course-id") || $("body").attr("data-course-id");
//     if (!courseId) {
//         const matchId = html.match(/"courseId"\s*:\s*(\d+)/);
//         if (matchId) courseId = matchId[1];
//     }
    
//     // 2. Logic lấy Title (Tiêu đề khóa học)
//     let title = $('h1.ud-heading-xl').text().trim();
//     if (!title) {
//         title = $('meta[property="og:title"]').attr('content');
//     }

//     // Kiểm tra lỗi
//     if (!courseId) {
//         if (html.includes('Login') || response.url.includes('login')) {
//             throw new Error("Cookie hết hạn hoặc bị redirect về Login.");
//         }
//         throw new Error("Không tìm thấy Course ID trên trang này.");
//     }

//     return { 
//         courseId: parseInt(courseId),
//         title: title || "Unknown Course Title"
//     };
// };

// /**
//  * Gửi request Enroll khóa học
//  */
// const enrollByGet = async (courseId, cookieString, refererUrl) => {
//     const { gotScraping } = await import('got-scraping');
//     const subscribeUrl = `https://${ssSUBDOMAIN}/course/subscribe/?courseId=${courseId}`;
    
//     const response = await gotScraping({
//         url: subscribeUrl,
//         method: 'GET',
//         http2: false,
//         followRedirect: true,
//         headerGeneratorOptions: {
//             browsers: [{ name: 'firefox', minVersion: 100 }],
//             devices: ['desktop'],
//             operatingSystems: ['windows'],
//         },
//         headers: {
//             'Host': ssSUBDOMAIN,
//             'Cookie': cookieString,
//             'Referer': refererUrl,
//             'Upgrade-Insecure-Requests': '1',
//         },
//         https: { rejectUnauthorized: false }
//     });

//     return { statusCode: response.statusCode, finalUrl: response.url };
// };

// // --- MAIN SERVICE ---

// /**
//  * Xử lý danh sách URLs:
//  * 1. Tìm task trong DB theo Email + URL
//  * 2. Lấy Info & Enroll
//  * 3. Update DB (Title, Status)
//  * * @param {Array<string>} urls - Mảng link khóa học
//  * @param {string} email - Email người dùng (để tìm record trong DB)
//  */
// const enrollCourses = async (urls, email) => {
//     if (!email) throw new Error("Yêu cầu Email để cập nhật Database.");

//     const cookieString = getCookieFromFile();
//     const results = [];

//     console.log(`\n🔄 [Enroll Service] Bắt đầu xử lý ${urls.length} link cho: ${email}`);

//     for (const rawUrl of urls) {
//         try {
//             // BƯỚC 1: Tìm bản ghi có sẵn trong DB (được tạo lúc user submit form)
//             // Trạng thái thường là 'pending' hoặc 'failed' (nếu thử lại)
//             const task = await DownloadTask.findOne({
//                 where: { 
//                     email: email, 
//                     course_url: rawUrl 
//                 }
//             });

//             if (!task) {
//                 console.log(`⚠️ [Skip] Không tìm thấy đơn hàng trong DB cho: ${rawUrl}`);
//                 results.push({ 
//                     success: false, 
//                     url: rawUrl, 
//                     message: 'Record not found in Database' 
//                 });
//                 continue; // Bỏ qua URL này
//             }

//             console.log(`🔹 [Task ID: ${task.id}] Đang xử lý...`);

//             // BƯỚC 2: Lấy thông tin (ID + Title)
//             const { courseId, title } = await getCourseInfo(rawUrl, cookieString);
            
//             // BƯỚC 3: Enroll
//             console.log(`⏳ Enroll ID: ${courseId} | Title: "${title}"`);
//             const enrollResult = await enrollByGet(courseId, cookieString, rawUrl);

//             // Kiểm tra kết quả: Nếu bị đẩy về login/sso là thất bại
//             const isSuccess = !enrollResult.finalUrl.includes("login") && !enrollResult.finalUrl.includes("sso");
//             const finalStatus = isSuccess ? 'enrolled' : 'failed';

//             // BƯỚC 4: Cập nhật Database
//             task.title = title;        // Lưu tên khóa học cho đẹp
//             task.status = finalStatus; // Chuyển sang enrolled để Python quét
//             // task.retry_count = 0;   // (Tùy chọn) Reset retry nếu muốn thử lại từ đầu
            
//             await task.save(); // Lưu thay đổi

//             console.log(`✅ [DB Updated] Task ${task.id} -> Status: ${finalStatus}`);

//             results.push({
//                 success: isSuccess,
//                 url: rawUrl,
//                 courseId: courseId,
//                 title: title,
//                 db_id: task.id,
//                 status: finalStatus
//             });

//         } catch (err) {
//             console.error(`❌ [Error] ${rawUrl}: ${err.message}`);

//             // Nếu có lỗi (ví dụ cookie chết, mạng lỗi), update DB thành failed
//             try {
//                 const task = await DownloadTask.findOne({ where: { email: email, course_url: rawUrl } });
//                 if (task) {
//                     task.status = 'failed';
//                     await task.save();
//                     console.log(`🔻 [DB Updated] Task ${task.id} -> Status: failed`);
//                 }
//             } catch (dbErr) {
//                 console.error("Lỗi khi update status failed:", dbErr.message);
//             }

//             results.push({
//                 success: false,
//                 url: rawUrl,
//                 status: 'error',
//                 message: err.message
//             });
//         }

//         // Delay 2 giây giữa các request để tránh bị chặn
//         await new Promise(r => setTimeout(r, 2000));
//     }

//     return results;
// };

// module.exports = {
//     enrollCourses
// };



// src/services/enroll.service.js
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { transformToNormalizeUdemyCourseUrl } = require('../utils/url.util');
const DownloadTask = require('../models/downloadTask.model'); // Đảm bảo đường dẫn đúng

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

    console.log(`👉 [Scraping] Target: ${targetUrl}`);

    // 2. Vòng lặp Retry (Thử lại tối đa 3 lần)
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            if (attempt > 1) {
                console.log(`   ⚠️ Lần ${attempt}: Đang thử lại do lỗi trước đó...`);
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
            console.log(`   ❌ Lần ${attempt} thất bại: ${e.message}`);
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

    console.log(`\n🔄 [Enroll Service] Xử lý ${urls.length} link cho: ${email}`);

    for (const rawUrl of urls) {
        try {
            // 1. Tìm Task trong DB
            const task = await DownloadTask.findOne({
                where: { email: email, course_url: rawUrl }
            });

            if (!task) {
                console.log(`⚠️ Skip: Không tìm thấy DB cho ${rawUrl}`);
                results.push({ success: false, url: rawUrl, message: 'Not found in DB' });
                continue;
            }

            console.log(`🔹 [Task ${task.id}] Đang xử lý...`);

            // 2. Lấy Info (Retry & Regex)
            const { courseId, title } = await getCourseInfo(rawUrl, cookieString);
            
            // 3. Enroll
            console.log(`⏳ Enroll ID: ${courseId} | Title: "${title}"`);
            const enrollResult = await enrollByGet(courseId, cookieString, rawUrl);

            const isSuccess = !enrollResult.finalUrl.includes("login") && !enrollResult.finalUrl.includes("sso");
            const finalStatus = isSuccess ? 'enrolled' : 'failed';

            // 4. Update DB
            task.title = title;
            task.status = finalStatus;
            await task.save();

            console.log(`✅ [OK] Task ${task.id} -> ${finalStatus}`);

            results.push({
                success: isSuccess,
                url: rawUrl,
                courseId: courseId,
                title: title,
                db_id: task.id,
                status: finalStatus
            });

        } catch (err) {
            console.error(`❌ [Failed] ${rawUrl}: ${err.message}`);

            // Cập nhật trạng thái failed vào DB để không bị treo pending
            try {
                const task = await DownloadTask.findOne({ where: { email, course_url: rawUrl } });
                if (task) { 
                    task.status = 'failed'; 
                    await task.save(); 
                }
            } catch (e) {}

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