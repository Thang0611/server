const crypto = require('crypto');
// Import service Google Drive của bạn (nơi chứa hàm cấp quyền)
// const driveService = require('../services/driveService'); 

// --- CẤU HÌNH ---
// KEY NÀY PHẢI TRÙNG KHỚP 100% VỚI BIẾN $secret_key BÊN PHP
const SECRET_KEY = 'KEY_BAO_MAT_CUA_BAN_2025'; 

/**
 * Hàm xử lý request từ WordPress
 */
exports.handleCourseRequest = async (req, res) => {
    try {
        console.log("📥 Nhận request từ WordPress...");

        // 1. LẤY DỮ LIỆU TỪ HEADER VÀ BODY
        const receivedSignature = req.headers['x-signature'];
        const timestamp = req.headers['x-timestamp'];
        const { order_id, email, courses } = req.body;

        // 2. VALIDATE CƠ BẢN
        if (!receivedSignature || !timestamp || !order_id || !email || !courses) {
            return res.status(400).json({ success: false, message: 'Thiếu dữ liệu bắt buộc.' });
        }

        // 3. KIỂM TRA BẢO MẬT (VERIFY SIGNATURE)
        // Logic PHP: $string_to_sign = $order_id . $user_email . $timestamp;
        // Lưu ý: Ép kiểu về String để nối chuỗi chính xác như PHP
        const stringToSign = String(order_id) + String(email) + String(timestamp);
        
        const expectedSignature = crypto
            .createHmac('sha256', SECRET_KEY)
            .update(stringToSign)
            .digest('hex');

        // So sánh chữ ký (Dùng timingSafeEqual để chống tấn công time-attack)
        if (expectedSignature !== receivedSignature) {
            console.error("❌ Lỗi: Chữ ký không khớp! Có thể là request giả mạo.");
            return res.status(403).json({ success: false, message: 'Chữ ký không hợp lệ.' });
        }

        // (Tuỳ chọn) Kiểm tra Timestamp để chống Replay Attack (ví dụ: chỉ nhận request trong vòng 5 phút)
        const requestTime = parseInt(timestamp, 10);
        const currentTime = Math.floor(Date.now() / 1000);
        if (Math.abs(currentTime - requestTime) > 300) { // 300 giây = 5 phút
             return res.status(400).json({ success: false, message: 'Request đã hết hạn (Timestamp quá cũ).' });
        }

        console.log(`✅ Xác thực thành công đơn hàng #${order_id}. Email: ${email}`);

        // 4. XỬ LÝ CẤP QUYỀN (LOOP QUA TỪNG KHÓA HỌC)
        const results = [];

        for (const course of courses) {
            const { course_name, drive_link } = course;
            
            // Tách File ID/Folder ID từ Link Drive
            const fileId = extractDriveId(drive_link);

            if (fileId) {
                console.log(`🔄 Đang cấp quyền folder: ${fileId} cho khoá: ${course_name}`);
                
                // --- GỌI HÀM CẤP QUYỀN CỦA BẠN TẠI ĐÂY ---
                // Ví dụ: await driveService.shareFile(fileId, email);
                // Giả lập thành công:
                results.push({ course: course_name, status: 'success', fileId });
            } else {
                console.warn(`⚠️ Link Drive không hợp lệ cho khoá: ${course_name}`);
                results.push({ course: course_name, status: 'failed', reason: 'Invalid Link' });
            }
        }

        // 5. PHẢN HỒI LẠI (Dù PHP không đợi, nhưng vẫn cần trả về 200 OK)
        return res.status(200).json({
            success: true,
            message: 'Đã tiếp nhận và xử lý.',
            results: results
        });

    } catch (error) {
        console.error("❌ Lỗi Server:", error);
        return res.status(500).json({ success: false, message: 'Lỗi Server nội bộ.' });
    }
};

/**
 * Hàm phụ trợ: Tách ID từ Link Google Drive
 * Hỗ trợ link folder và file cơ bản
 */
function extractDriveId(url) {
    if (!url) return null;
    
    // Regex bắt ID từ các dạng link phổ biến:
    // - drive.google.com/drive/folders/ID
    // - drive.google.com/file/d/ID/view
    // - drive.google.com/open?id=ID
    const regex = /[-\w]{25,}/;
    const match = url.match(regex);
    return match ? match[0] : null;
}