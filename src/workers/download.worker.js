const enrollService = require('../services/enroll.service');
const emailService = require('../services/email.service');
const DownloadTask = require('../models/downloadTask.model');

// Thêm dòng này để debug
console.log("👉 CHECK ENROLL SERVICE:", enrollService);

// Hàm xử lý từng Task (Chạy ngầm)
exports.processTask = async (task) => {
    // ⚠️ SỬA: Dùng task.id thay vì task._id
    console.log(`⚙️ [Worker] Bắt đầu xử lý Task ID: ${task.id}`); 

    try {
        // --- BƯỚC 1: ENROLL ---
        if (task.course_url.includes('udemy.com')) {

            // const enrollResults = await enrollService.enrollCourses([task.course_url],email);
            const enrollResults = await enrollService.enrollCourses([task.course_url],task.email);

            const result = enrollResults[0];

            if (!result || !result.success) {
                throw new Error(`Enroll thất bại: ${result ? result.message : 'Unknown error'}`);
            }
            console.log(`✅ [Worker] Enroll thành công: ${task.course_url}`);
        }

        // --- BƯỚC 2: DOWNLOAD ---
        // ⚠️ SỬA: Update DB
        await DownloadTask.update(
            { status: 'enrolled' }, 
            { where: { id: task.id } }
        );
        
        console.log(`🎉 [Worker] Hoàn tất Task ID: ${task.id}`);

    } catch (error) {
        console.error(`❌ [Worker Error] Task ${task.id} thất bại:`, error.message);

        // 1. Cập nhật DB là failed
        // ⚠️ SỬA: Update DB failed
        await DownloadTask.update({ 
            status: 'failed',
            error_log: error.message
        }, { 
            where: { id: task.id } 
        });

        // 2. GỬI EMAIL BÁO ADMIN
        // Lưu ý: Đảm bảo emailService xử lý được object task của Sequelize
        await emailService.sendErrorAlert(task, error.message);
    }
};