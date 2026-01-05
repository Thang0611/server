const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const { transformToNormalizeUdemyCourseUrl,transformToSamsungUdemy } = require('../utils/url.util');

const PRICE_PER_COURSE = 2000;

const crawlSingleCourse = async (formattedUrl) => {
    // Nếu bạn muốn crawl qua samsungu, hãy giữ nguyên logic replace này.
    // Lưu ý: Nếu samsungu yêu cầu đăng nhập, axios sẽ bị redirect về trang login 
    // và không tìm thấy data. Nếu code cũ bạn chạy được Title thì code này cũng sẽ chạy được.
    const targetUrl = formattedUrl.replace(
        /https?:\/\/udemy\.com/,
        "https://samsungu.udemy.com"
    );

    const config = {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": formattedUrl, // Referer nên là link gốc
            // Nếu samsungu yêu cầu cookie, bạn phải thêm dòng Cookie ở đây
            // "Cookie": "access_token=...", 
        },
        httpsAgent: new https.Agent({
            rejectUnauthorized: false,
            minVersion: "TLSv1.2",
        }),
        timeout: 15000,
    };

    const response = await axios.get(targetUrl, config);

    if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}`);
    }

    const html = response.data;
    const $ = cheerio.load(html);

    // 1. Lấy Title & Image (Giữ nguyên logic cũ của bạn)
    let title =
        $("h1.clp-lead__title").text().trim() ||
        $("h1").text().trim() ||
        $("meta[property='og:title']").attr("content");

    const image = $("meta[property='og:image']").attr("content") || "";

    if (!title) {
        // Có thể bị redirect sang trang Login
        if (html.includes("Log In") || html.includes("Sign Up")) {
            throw new Error("Trang yêu cầu đăng nhập (Không lấy được thông tin).");
        }
        throw new Error("Không tìm thấy tiêu đề khóa học.");
    }

    // ============================================
    // 2. LOGIC LẤY COURSE ID (Mới thêm)
    // ============================================
    let courseId = null;

    // Cách 1: Tìm trong thuộc tính data của thẻ Body (Phổ biến nhất)
    courseId = $("body").attr("data-clp-course-id") || $("body").attr("data-course-id");

    // Cách 2: Tìm trong Script JSON (Regex quét toàn bộ HTML)
    // Udemy thường render: "courseId":123456 trong các biến cấu hình
    if (!courseId) {
        // Regex tìm chuỗi "courseId": 12345
        const matchId = html.match(/"courseId"\s*:\s*(\d+)/);
        if (matchId) {
            courseId = matchId[1];
        }
    }

    // Cách 3: Tìm kiểu cũ (đôi khi nằm trong thẻ input hidden hoặc meta)
    if (!courseId) {
        const matchOld = html.match(/data-course-id="(\d+)"/);
        if (matchOld) {
            courseId = matchOld[1];
        }
    }

    // Convert sang số nguyên nếu tìm thấy
    if (courseId) {
        courseId = parseInt(courseId, 10);
    } else {
        // Nếu không tìm thấy ID, có thể trả về null hoặc báo lỗi tùy bạn
        console.warn(`⚠️ Không tìm thấy ID cho url: ${formattedUrl}`);
        courseId = null;
    }

    return { title, image, courseId };
};

// =========================
// API: Nhận mảng URL
// =========================
const getCourseInfo = async (req, res) => {
    try {
        const { urls } = req.body;
        console.log('REQ BODY:', req.body);
        if (!Array.isArray(urls) || urls.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng truyền mảng urls.",
            });
        }

        // Thay thế toàn bộ đoạn vòng lặp for cũ bằng đoạn này:
        const promises = urls.map(async (rawUrl) => {
            try {
                const formattedUrl = transformToSamsungUdemy(rawUrl);
                console.log(`🚀 Đang cào: ${formattedUrl}`); // Tắt log bớt để đỡ lag console
                const data = await crawlSingleCourse(formattedUrl);

                if (data.courseId) {
                    return {
                        success: true,
                        url: rawUrl,
                        title: data.title,
                        image: data.image,
                        price: PRICE_PER_COURSE,
                        courseId: data.courseId
                    };
                } else {
                    return {
                        success: false,
                        url: rawUrl,
                        title: "Link bị lỗi hoặc cần đăng nhập",
                        image: data.image || "",
                        price: 0,
                        courseId: null
                    };
                }
            } catch (err) {
                return {
                    success: false,
                    url: rawUrl,
                    message: err.message,
                    price: 0
                };
            }
        });

        // Chờ tất cả chạy xong cùng lúc
        const results = await Promise.all(promises);
        console.log(results)

        return res.status(200).json({
            success: true,
            results,
        });
    } catch (error) {
        console.error("❌ Lỗi server:", error.message);
        return res.status(500).json({
            success: false,
            message: "Lỗi server nội bộ.",
        });
    }
};

module.exports = { getCourseInfo };
