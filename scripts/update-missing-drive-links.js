/**
 * Script để cập nhật drive_link cho các courses từ tasks permanent đã completed
 * nhưng chưa có drive_link trong bảng courses
 */

const { DownloadTask, Course } = require('../src/models');
const { Op } = require('sequelize');
const { transformToSamsungUdemy, transformToNormalizeUdemyCourseUrl } = require('../src/utils/url.util');
const adminDownloadService = require('../src/services/adminDownload.service');
const Logger = require('../src/utils/logger.util');

async function updateMissingDriveLinks() {
  console.log('\n=== CẬP NHẬT DRIVE_LINK CHO COURSES THIẾU ===\n');
  
  // Tìm tất cả tasks permanent đã completed có drive_link
  const tasks = await DownloadTask.findAll({
    where: {
      course_type: 'permanent',
      status: 'completed',
      drive_link: { [Op.ne]: null },
      order_id: null // Admin downloads
    },
    attributes: ['id', 'course_url', 'title', 'drive_link', 'updated_at'],
    order: [['updated_at', 'DESC']],
    limit: 100
  });
  
  console.log(`Tìm thấy ${tasks.length} tasks permanent đã completed\n`);
  
  if (tasks.length === 0) {
    console.log('Không có task nào để cập nhật.');
    process.exit(0);
  }
  
  const results = {
    updated: [],
    notFound: [],
    alreadyUpdated: [],
    errors: []
  };
  
  for (const task of tasks) {
    try {
      console.log(`\n📋 Xử lý Task #${task.id}: ${task.title || task.course_url}`);
      
      // Tìm course theo URL
      const normalizedUrl = transformToSamsungUdemy(task.course_url) || task.course_url;
      const normalizedUrl2 = transformToNormalizeUdemyCourseUrl(task.course_url) || task.course_url;
      
      const course = await Course.findOne({
        where: {
          [Op.or]: [
            { course_url: task.course_url },
            { course_url: normalizedUrl },
            { course_url: normalizedUrl2 }
          ]
        },
        attributes: ['id', 'title', 'course_url', 'drive_link']
      });
      
      if (!course) {
        console.log(`  ❌ Course không tìm thấy`);
        results.notFound.push({ task, reason: 'Course not found' });
        continue;
      }
      
      // Kiểm tra xem đã có drive_link chưa
      if (course.drive_link === task.drive_link) {
        console.log(`  ✅ Course đã có drive_link giống nhau`);
        results.alreadyUpdated.push({ task, course });
        continue;
      }
      
      // Cập nhật drive_link
      console.log(`  🔄 Đang cập nhật drive_link...`);
      console.log(`     Task drive_link: ${task.drive_link}`);
      console.log(`     Course drive_link hiện tại: ${course.drive_link || '(null)'}`);
      
      // Sử dụng hàm updateCourseDriveLink từ service
      const updateResult = await adminDownloadService.updateCourseDriveLink(task.id, task.drive_link);
      
      if (updateResult.updated) {
        console.log(`  ✅ Cập nhật thành công!`);
        console.log(`     Course ID: ${updateResult.courseId}`);
        results.updated.push({ task, course, updateResult });
      } else {
        console.log(`  ⚠️  Không cập nhật: ${updateResult.reason}`);
        results.notFound.push({ task, reason: updateResult.reason });
      }
      
    } catch (error) {
      console.error(`  ❌ Lỗi: ${error.message}`);
      results.errors.push({ task, error: error.message });
    }
  }
  
  // Tóm tắt kết quả
  console.log('\n\n=== TÓM TẮT KẾT QUẢ ===\n');
  console.log(`  ✅ Đã cập nhật: ${results.updated.length}`);
  console.log(`  ✅ Đã có sẵn: ${results.alreadyUpdated.length}`);
  console.log(`  ❌ Không tìm thấy course: ${results.notFound.length}`);
  console.log(`  ❌ Lỗi: ${results.errors.length}`);
  console.log('');
  
  if (results.updated.length > 0) {
    console.log('✅ CÁC COURSES ĐÃ ĐƯỢC CẬP NHẬT:\n');
    results.updated.forEach(({ task, course }) => {
      console.log(`  Task #${task.id} → Course #${course.id}: ${course.title || course.course_url}`);
    });
    console.log('');
  }
  
  if (results.notFound.length > 0) {
    console.log('❌ CÁC TASKS KHÔNG TÌM THẤY COURSE:\n');
    results.notFound.forEach(({ task, reason }) => {
      console.log(`  Task #${task.id}: ${task.title || task.course_url}`);
      console.log(`    Lý do: ${reason}`);
    });
    console.log('');
    console.log('💡 Cần tạo courses trong bảng courses trước khi cập nhật drive_link');
  }
  
  if (results.errors.length > 0) {
    console.log('❌ CÁC LỖI:\n');
    results.errors.forEach(({ task, error }) => {
      console.log(`  Task #${task.id}: ${error}`);
    });
  }
  
  process.exit(0);
}

updateMissingDriveLinks().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
