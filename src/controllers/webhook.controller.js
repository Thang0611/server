const DownloadTask = require('../models/downloadTask.model');
const transporter = require('../config/email');
const { findFolderByName, grantReadAccess } = require('../utils/drive.util');
const path = require('path');
const { transformToNormalizeUdemyCourseUrl } = require('../utils/url.util');
require('dotenv').config({ path: path.resolve(__dirname, './../../.env') });

// Hàm delay để đợi Drive index file
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

exports.finalizeDownload = async (req, res) => {
    // Log body nhận được để debug
    //📥 [Webhook Data]:", req.body);

    const { secret_key, task_id, folder_name } = req.body;

    // 1. Validate Secret Key
    // if (secret_key !== process.env.API_SECRET_KEY) {
    if (secret_key !== "KEY_BAO_MAT_CUA_BAN_2025") {
        console.warn(`❌ [Auth Fail] Client Key: ${secret_key} != Server Key: ${process.env.API_SECRET_KEY}`);
        return res.status(403).json({ message: 'Sai Secret Key' });
    }

    try {
        // 2. Tìm task trong DB
        const task = await DownloadTask.findByPk(task_id);

        if (!task) {
            console.error(`❌ [DB Error] Không tìm thấy Task ID: ${task_id}`);
            return res.status(404).json({ message: 'Task không tồn tại' });
        }

        console.log(`🔄 [Process] Đang xử lý Task ID: ${task_id} | Folder: ${folder_name}`);

        // 3. Tìm Folder trên Drive (CÓ CƠ CHẾ RETRY)
        // Vì Rclone vừa up xong, Drive API có thể chưa thấy ngay. Thử lại 5 lần, mỗi lần cách nhau 3s.
        let driveFolder = null;
        let retryCount = 0;
        const maxRetries = 5;

        while (retryCount < maxRetries) {
            try {
                driveFolder = await findFolderByName(folder_name);
                if (driveFolder) break; // Tìm thấy thì thoát vòng lặp
            } catch (err) {
                console.warn(`⚠️ Lỗi tìm folder (lần ${retryCount + 1}): ${err.message}`);
            }

            console.log(`⏳ Đợi Drive index folder... (${retryCount + 1}/${maxRetries})`);
            await wait(3000); // Đợi 3 giây
            retryCount++;
        }

        let driveLink = '#';
        if (driveFolder) {
            console.log(`✅ [Drive] Tìm thấy Folder ID: ${driveFolder.id}`);
            driveLink = driveFolder.webViewLink;

            // 4. Cấp quyền truy cập
            try {
                await grantReadAccess(driveFolder.id, task.email);
                console.log(`✅ [Drive] Đã share quyền cho: ${task.email}`);
            } catch (shareErr) {
                console.error(`❌ [Permission Error] Không thể share quyền: ${shareErr.message}`);
                // Không return lỗi ở đây để vẫn gửi mail báo admin/user
            }
        } else {
            console.error(`❌ [Drive Error] Không tìm thấy folder '${folder_name}' sau ${maxRetries} lần thử.`);
            // Vẫn tiếp tục chạy để update DB là completed (dù không có link) hoặc xử lý tay sau
        }

        // 5. Cập nhật DB
        // Kiểm tra xem task có hàm save không (đề phòng lỗi ORM)
        if (typeof task.save === 'function') {
            task.status = 'completed';
            await task.save();
        } else {
            // Fallback nếu dùng Mongoose hoặc query raw
            await DownloadTask.update({ status: 'completed' }, { where: { id: task_id } });
        }

        // 6. Gửi Email
        if (!process.env.EMAIL_USER) {
            throw new Error("Thiếu biến môi trường EMAIL_USER");
        }

        // const mailOptions = {
        //     from: process.env.EMAIL_USER,
        //     to: task.email,
        //     subject: '✅ Khóa học của bạn đã sẵn sàng!',
        //     html: `
        //         <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd;">
        //             <h3 style="color: #2c3e50;">Khóa học đã tải xong!</h3>
        //             <p>Hệ thống đã tải thành công khóa học và upload lên Google Drive.</p>

        //             <div style="background: #f9f9f9; padding: 15px; margin: 20px 0;">
        //                 <p><strong>Tên khóa:</strong> ${folder_name}</p>
        //                 <p><strong>Email cấp quyền:</strong> ${task.email}</p>
        //             </div>

        //             ${driveFolder ? `
        //             <a href="${driveLink}" style="background-color: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">
        //                 MỞ GOOGLE DRIVE NGAY
        //             </a>` : `
        //             <p style="color: red;">⚠️ Hệ thống chưa lấy được link Drive tự động. Vui lòng đợi Admin cập nhật hoặc liên hệ hỗ trợ.</p>
        //             `}

        //             <p style="margin-top: 20px; font-size: 12px; color: #666;">
        //                 Link udemy: <a href="${transformToNormalizeUdemyCourseUrl(task.course_url)}">${transformToNormalizeUdemyCourseUrl(task.course_url)}</a>
        //             </p>
        //         </div>
        //     `
        // };
        const mailOptions = {
            from: `"KhoaHocGiaRe Support" <${process.env.EMAIL_USER}>`, // Thêm tên hiển thị cho uy tín
            to: task.email,
            subject: `✅ Hoàn tất: Khóa học "${folder_name}" đã sẵn sàng!`,
            html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    /* Reset styles */
                    body { margin: 0; padding: 0; background-color: #f4f4f7; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
                    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
                    .header { background-color: #2c3e50; padding: 30px 20px; text-align: center; }
                    .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; }
                    .content { padding: 40px 30px; color: #51545e; line-height: 1.6; }
                    .success-icon { text-align: center; margin-bottom: 20px; }
                    .info-box { background-color: #f8f9fa; border-left: 4px solid #10b981; padding: 20px; border-radius: 4px; margin: 25px 0; }
                    .info-item { margin-bottom: 10px; font-size: 15px; }
                    .info-item strong { color: #2c3e50; min-width: 120px; display: inline-block; }
                    .btn-container { text-align: center; margin-top: 35px; margin-bottom: 20px; }
                    .btn { background-color: #007bff; color: #ffffff !important; padding: 14px 30px; text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(0, 123, 255, 0.25); transition: background-color 0.3s; }
                    .btn:hover { background-color: #0056b3; }
                    .footer { background-color: #f4f4f7; padding: 20px; text-align: center; font-size: 12px; color: #a8aaaf; }
                    .link-sub { color: #a8aaaf; text-decoration: underline; }
                </style>
            </head>
            <body>
                <div style="padding: 40px 0;">
                    <div class="container">
                        <div class="header">
                            <h1>Khóa Học Đã Tải Xong! 🚀</h1>
                        </div>

                        <div class="content">
                            <div class="success-icon">
                                <img src="https://cdn-icons-png.flaticon.com/512/190/190411.png" width="60" alt="Success" style="display:block; margin:0 auto;">
                            </div>
                            
                            <p style="text-align: center; font-size: 16px; margin-bottom: 30px;">
                                Hệ thống đã xử lý thành công yêu cầu của bạn.<br>
                                Dưới đây là thông tin truy cập khóa học:
                            </p>

                            <div class="info-box">
                                <div class="info-item">
                                    <strong>📦 Tên khóa học:</strong><br> 
                                    <span style="color: #333;">${folder_name}</span>
                                </div>
                                <div class="info-item" style="margin-top: 15px;">
                                    <strong>📧 Email cấp quyền:</strong><br> 
                                    <span style="color: #333;">${task.email}</span>
                                </div>
                                <div class="info-item" style="margin-top: 15px;">
                                    <strong>🔗 Nguồn Udemy:</strong><br> 
                                    <a href="${transformToNormalizeUdemyCourseUrl(task.course_url)}" style="color: #007bff; text-decoration: none; word-break: break-all; font-size: 13px;">Xem link gốc</a>
                                </div>
                            </div>

                            <div class="btn-container">
                                ${driveFolder ? `
                                <a href="${driveLink}" class="btn">
                                    📂 TRUY CẬP GOOGLE DRIVE NGAY
                                </a>
                                <p style="margin-top: 15px; font-size: 13px; color: #888;">
                                    (Vui lòng kiểm tra cả mục "Được chia sẻ với tôi" nếu không thấy)
                                </p>
                                ` : `
                                <div style="background-color: #fff3cd; color: #856404; padding: 15px; border-radius: 4px; border: 1px solid #ffeeba;">
                                    ⚠️ <strong>Chờ xử lý:</strong> Hệ thống đang cập nhật link Drive. Vui lòng quay lại sau ít phút hoặc liên hệ Admin.
                                </div>
                                `}
                            </div>
                        </div>

                        <div class="footer">
                            <p>Email này được gửi tự động từ hệ thống KhoaHocGiaRe.</p>
                            <p>© ${new Date().getFullYear()} All rights reserved.</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log('📧 [Email] Đã gửi mail thành công.');

        return res.json({ success: true, message: 'Hoàn tất quy trình' });

    } catch (error) {
        // Log chi tiết Stack Trace để biết dòng nào lỗi
        console.error('❌ [Webhook CRITICAL Error]:');
        console.error(error);

        return res.status(500).json({
            message: 'Lỗi server nội bộ',
            details: error.message // Trả về chi tiết lỗi cho Python log
        });
    }
};