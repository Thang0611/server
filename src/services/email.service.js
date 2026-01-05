const nodemailer = require('nodemailer');

// Cấu hình SMTP (Ví dụ dùng Gmail)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'admin.system@gmail.com', // Email hệ thống gửi đi
        pass: 'your_app_password'       // App Password của Gmail
    }
});

const ADMIN_EMAIL = 'admin.real@gmail.com'; // Email Admin nhận báo cáo

exports.sendErrorAlert = async (taskData, errorMessage) => {
    const subject = `[CẢNH BÁO] Lỗi Download/Enroll - User: ${taskData.email}`;
    
    const htmlContent = `
        <h3>Hệ thống gặp lỗi khi xử lý đơn hàng</h3>
        <p><strong>Order ID:</strong> ${taskData.order_id || 'N/A'}</p>
        <p><strong>User Email:</strong> ${taskData.email}</p>
        <p><strong>Course URL:</strong> ${taskData.course_url}</p>
        <hr/>
        <p style="color: red; font-weight: bold;">Chi tiết lỗi:</p>
        <pre>${errorMessage}</pre>
        <p><em>Vui lòng kiểm tra server hoặc account enroll ngay.</em></p>
    `;

    try {
        await transporter.sendMail({
            from: '"Download System" <no-reply@system.com>',
            to: ADMIN_EMAIL,
            subject: subject,
            html: htmlContent
        });
        console.log(`📧 [Email] Đã gửi báo cáo lỗi tới Admin.`);
    } catch (err) {
        console.error("❌ [Email Error] Không gửi được mail:", err.message);
    }
};