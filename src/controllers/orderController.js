const crypto = require('crypto');
const TaskModel = require('../models/taskModel'); // Model MongoDB của bạn

exports.receiveOrder = async (req, res) => {
    // 1. CẤU HÌNH (Phải khớp 100% với file PHP)
    const SECRET_KEY = 'KEY_BAO_MAT_CUA_BAN_2025';

    try {
        console.log("📨 Có đơn hàng mới từ WordPress!");

        // 2. Lấy dữ liệu từ Header và Body
        const signature = req.headers['x-signature'];
        const timestamp = req.headers['x-timestamp'];
        const { order_id, email, courses } = req.body;

        // 3. Kiểm tra bảo mật
        if (!signature || !timestamp || !email) {
            console.log("❌ Thiếu thông tin xác thực.");
            return res.status(401).json({ msg: "Missing headers" });
        }

        // Chống replay attack (Request quá 5 phút thì từ chối)
        const now = Math.floor(Date.now() / 1000);
        if (Math.abs(now - parseInt(timestamp)) > 300) {
            console.log("❌ Request quá hạn (Expired).");
            return res.status(403).json({ msg: "Expired" });
        }

        // Tái tạo chữ ký để so sánh
        const stringToSign = `${order_id}${email}${timestamp}`;
        const mySignature = crypto
            .createHmac('sha256', SECRET_KEY)
            .update(stringToSign)
            .digest('hex');

        if (signature !== mySignature) {
            console.log("❌ Sai chữ ký! Có thể ai đó đang giả mạo.");
            return res.status(403).json({ msg: "Invalid Signature" });
        }

        // --- NẾU ĐẾN ĐÂY LÀ HỢP LỆ ---
        console.log(`✅ Xác thực OK. Email: ${email}`);
        console.log(`📦 Số lượng khóa học: ${courses.length}`);
        const vnTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        // 4. Lưu vào Database (Để Worker xử lý sau)
        // Duyệt qua từng khóa học trong đơn
        for (const course of courses) {
            await TaskModel.create({
                email: email,                  // Email khách
                course_name: course.course_name, 
                drive_link: course.drive_link, // Link Folder cần share
                status: 'pending',             // Trạng thái chờ xử lý
                created_at: vnTime
            });
            console.log(`   + Đã thêm Task: ${course.course_name}`);
        }

        // Trả về OK ngay lập tức
        return res.status(200).json({ status: "success" });

    } catch (error) {
        console.error("❌ Lỗi Server:", error);
        return res.status(500).json({ msg: "Server Error" });
    }
};