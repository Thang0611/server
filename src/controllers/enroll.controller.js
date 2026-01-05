// const { gotScraping } = require('got-scraping'); // <-- Vẫn giữ comment dòng này
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const SUBDOMAIN = 'udemy.com';
const ssSUBDOMAIN = 'samsungu.udemy.com';
const COOKIE_FILE_PATH = path.join(__dirname, './../../cookies.txt');

// ================= HELPER =================
const getCookieFromFile = () => {
    try {
        if (!fs.existsSync(COOKIE_FILE_PATH)) throw new Error("⚠️ Chưa tạo file cookie.txt");
        return fs.readFileSync(COOKIE_FILE_PATH, 'utf8').replace(/(\r\n|\n|\r)/gm, "").trim();
    } catch (err) {
        throw new Error(err.message);
    }
};

// ================= CORE LOGIC (ĐÃ SỬA) =================

const getCourseId = async (rawUrl, cookieString) => {
    console.log(`🔍 Quét ID tại: ${targetUrl}`);
    // Import động
    const { gotScraping } = await import('got-scraping');

    try {
        const urlObj = new URL(rawUrl);
        if (urlObj.searchParams.has('courseId')) return parseInt(urlObj.searchParams.get('courseId'));
    } catch (e) {}

    let formattedUrl = rawUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) formattedUrl = "https://" + formattedUrl;
    
    // Target vào SamsungU
    const targetUrl = formattedUrl.replace(/udemy\.com/, SUBDOMAIN);

    console.log(`🔍 Quét ID tại: ${targetUrl}`);

    const response = await gotScraping({
        url: targetUrl,
        method: 'GET',
        http2: false, // <--- FIX QUAN TRỌNG: Tắt HTTP/2 để tránh Fingerprint
        headerGeneratorOptions: {
            browsers: [{ name: 'firefox', minVersion: 100 }], // <--- Đổi sang Firefox
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
        retry: { limit: 2 } // Thử lại nếu lỗi mạng
    });

    const html = response.body;
    const $ = cheerio.load(html);
    
    // Logic lấy ID 3 lớp
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
        // Nếu không tìm thấy ID, khả năng cao là Cookie hết hạn hoặc bị Redirect Login
        if (html.includes('Login') || response.url.includes('login')) {
            throw new Error("Bị redirect về trang Login (Cookie lỗi hoặc hết hạn).");
        }
        throw new Error("Không lấy được Course ID.");
    }
    
    return parseInt(courseId);
};

const enrollByGet = async (courseId, cookieString, refererUrl) => {
    const { gotScraping } = await import('got-scraping');

    const subscribeUrl = `https://${ssSUBDOMAIN}/course/subscribe/?courseId=${courseId}`;
    
    console.log(`➡️  Gửi lệnh Enroll (GET): ${subscribeUrl}`);

    const response = await gotScraping({
        url: subscribeUrl,
        method: 'GET',
        http2: false, // <--- FIX QUAN TRỌNG
        followRedirect: true,
        headerGeneratorOptions: {
            browsers: [{ name: 'firefox', minVersion: 100 }], // <--- Đổi sang Firefox
            devices: ['desktop'],
            operatingSystems: ['windows'],
        },
        headers: {
            'Host': ssSUBDOMAIN,
            'Cookie': cookieString,
            'Referer': refererUrl || `https://${ssSUBDOMAIN}/`,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
        },
        https: { rejectUnauthorized: false }
    });

    return {
        statusCode: response.statusCode,
        finalUrl: response.url
    };
};

// ================= CONTROLLER =================

const enrollController = async (req, res) => {
    try {
        const { urls } = req.body;
        if (!urls || !Array.isArray(urls)) {
            return res.status(400).json({ success: false, message: "Thiếu mảng 'urls'" });
        }

        const cookieString = getCookieFromFile();
        const results = [];

        console.log(`\n🚀 Bắt đầu xử lý ${urls.length} link...`);

        for (const rawUrl of urls) {
            try {
                // B1: Lấy ID
                const courseId = await getCourseId(rawUrl, cookieString);
                
                // B2: Enroll
                console.log(`✅ ID: ${courseId} | Đang thực thi...`);
                const enrollResult = await enrollByGet(courseId, cookieString, rawUrl);

                // Check thành công: Không bị đá về trang login
                const isSuccess = !enrollResult.finalUrl.includes("login") && !enrollResult.finalUrl.includes("sso");
                
                results.push({
                    success: isSuccess,
                    url: rawUrl,
                    courseId: courseId,
                    message: isSuccess ? "Thành công (Redirected)" : "Thất bại (Về trang Login)",
                    finalData: enrollResult.finalUrl
                });

            } catch (err) {
                console.error(`❌ Lỗi: ${err.message}`);
                // Bắt lỗi cụ thể handshake để báo user
                let msg = err.message;
                if (msg.includes("SSL routines")) {
                    msg = "Lỗi SSL Handshake (Cloudflare chặn). Thử đổi IP hoặc cập nhật Cookie.";
                }

                results.push({
                    success: false,
                    url: rawUrl,
                    message: msg
                });
            }

            // Nghỉ 2s
            await new Promise(r => setTimeout(r, 2000));
        }

        return res.json({ success: true, results });

    } catch (error) {
        console.error("System Error:", error);
        return res.status(500).json({ success: false, message: "Lỗi Server Node.js" });
    }
};

module.exports = { enrollController };