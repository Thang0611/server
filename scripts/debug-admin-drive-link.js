/**
 * Debug script để kiểm tra tại sao drive_link không được cập nhật vào bảng courses
 * 
 * Usage: node scripts/debug-admin-drive-link.js [task_id]
 */

const sequelize = require('../src/config/database');
const { Course, DownloadTask } = require('../src/models');
const { Op } = require('sequelize');
const { transformToSamsungUdemy, transformToNormalizeUdemyCourseUrl } = require('../src/utils/url.util');

async function debugTask(taskId) {
  console.log('\n=== DEBUG ADMIN DOWNLOAD DRIVE_LINK ===\n');
  
  // 1. Tìm task
  const task = await DownloadTask.findByPk(taskId, {
    attributes: ['id', 'course_url', 'course_type', 'order_id', 'status', 'drive_link', 'title', 'created_at', 'updated_at']
  });
  
  if (!task) {
    console.error(`❌ Task ${taskId} không tồn tại`);
    process.exit(1);
  }
  
  console.log('📋 THÔNG TIN TASK:');
  console.log(JSON.stringify(task.toJSON(), null, 2));
  console.log('');
  
  // 2. Kiểm tra điều kiện admin download
  console.log('🔍 KIỂM TRA ĐIỀU KIỆN:');
  const isPermanent = task.course_type === 'permanent';
  const hasNoOrder = task.order_id === null;
  const isCompleted = task.status === 'completed';
  const hasDriveLink = task.drive_link !== null && task.drive_link.trim() !== '';
  
  console.log(`  - course_type === 'permanent': ${isPermanent} ${isPermanent ? '✅' : '❌'}`);
  console.log(`  - order_id === null: ${hasNoOrder} ${hasNoOrder ? '✅' : '❌'}`);
  console.log(`  - status === 'completed': ${isCompleted} ${isCompleted ? '✅' : '❌'}`);
  console.log(`  - drive_link có giá trị: ${hasDriveLink} ${hasDriveLink ? '✅' : '❌'}`);
  console.log('');
  
  if (!isPermanent || !hasNoOrder) {
    console.log('❌ Task không phải admin download (cần course_type=permanent và order_id=null)');
    console.log('   → Hàm updateCourseDriveLink sẽ skip với reason: "Not an admin download"');
    process.exit(0);
  }
  
  if (!isCompleted || !hasDriveLink) {
    console.log('❌ Task chưa hoàn thành hoặc chưa có drive_link');
    console.log('   → Webhook sẽ không gọi updateCourseDriveLink');
    process.exit(0);
  }
  
  // 3. Tìm course theo URL
  console.log('🔍 TÌM COURSE THEO URL:');
  console.log(`  Task course_url: ${task.course_url}`);
  console.log('');
  
  const normalizedUrl = transformToSamsungUdemy(task.course_url) || task.course_url;
  const normalizedUrl2 = transformToNormalizeUdemyCourseUrl(task.course_url) || task.course_url;
  
  console.log('  Các biến thể URL sẽ được tìm:');
  console.log(`    1. ${task.course_url}`);
  console.log(`    2. ${normalizedUrl}`);
  console.log(`    3. ${normalizedUrl2}`);
  console.log('');
  
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
    console.log('❌ KHÔNG TÌM THẤY COURSE');
    console.log('');
    console.log('   → Hàm updateCourseDriveLink sẽ return: { updated: false, reason: "Course not found" }');
    console.log('');
    console.log('🔍 TÌM COURSES CÓ URL TƯƠNG TỰ:');
    
    // Tìm courses có URL tương tự
    const urlParts = task.course_url.split('/');
    const courseSlug = urlParts[urlParts.length - 1]?.split('?')[0];
    
    if (courseSlug) {
      const similarCourses = await Course.findAll({
        where: {
          course_url: { [Op.like]: `%${courseSlug}%` }
        },
        attributes: ['id', 'title', 'course_url', 'drive_link'],
        limit: 10
      });
      
      if (similarCourses.length > 0) {
        console.log(`   Tìm thấy ${similarCourses.length} courses có URL chứa "${courseSlug}":`);
        similarCourses.forEach(c => {
          console.log(`     - ID: ${c.id}, URL: ${c.course_url}`);
        });
      } else {
        console.log(`   Không tìm thấy courses nào có URL chứa "${courseSlug}"`);
      }
    }
    
    console.log('');
    console.log('💡 GIẢI PHÁP:');
    console.log('   1. Kiểm tra xem course có tồn tại trong bảng courses không');
    console.log('   2. So sánh URL giữa task và course (có thể format khác nhau)');
    console.log('   3. Nếu course chưa tồn tại, cần tạo course trước khi download');
    
    process.exit(0);
  }
  
  console.log('✅ TÌM THẤY COURSE:');
  console.log(JSON.stringify(course.toJSON(), null, 2));
  console.log('');
  
  // 4. Kiểm tra drive_link hiện tại
  console.log('🔍 KIỂM TRA DRIVE_LINK:');
  console.log(`  Task drive_link: ${task.drive_link}`);
  console.log(`  Course drive_link: ${course.drive_link || '(null)'}`);
  console.log('');
  
  if (course.drive_link === task.drive_link) {
    console.log('✅ Course đã có drive_link giống với task');
    console.log('   → Có thể đã được cập nhật thành công');
  } else {
    console.log('❌ Course drive_link khác với task drive_link');
    console.log('   → Cần cập nhật course.drive_link = task.drive_link');
    console.log('');
    console.log('💡 THỬ CẬP NHẬT THỦ CÔNG:');
    console.log('   const adminDownloadService = require("./src/services/adminDownload.service");');
    console.log(`   await adminDownloadService.updateCourseDriveLink(${task.id}, "${task.drive_link}");`);
  }
  
  process.exit(0);
}

async function listRecentCompletedTasks() {
  console.log('\n=== DANH SÁCH TASKS HOÀN THÀNH GẦN ĐÂY ===\n');
  
  const tasks = await DownloadTask.findAll({
    where: {
      course_type: 'permanent',
      status: 'completed',
      drive_link: { [Op.ne]: null }
    },
    attributes: ['id', 'course_url', 'title', 'order_id', 'drive_link', 'updated_at'],
    order: [['updated_at', 'DESC']],
    limit: 10
  });
  
  if (tasks.length === 0) {
    console.log('Không tìm thấy tasks nào');
    process.exit(0);
  }
  
  console.log(`Tìm thấy ${tasks.length} tasks:\n`);
  
  for (const task of tasks) {
    const course = await Course.findOne({
      where: {
        [Op.or]: [
          { course_url: task.course_url },
          { course_url: transformToSamsungUdemy(task.course_url) || task.course_url },
          { course_url: transformToNormalizeUdemyCourseUrl(task.course_url) || task.course_url }
        ]
      },
      attributes: ['id', 'course_url', 'drive_link']
    });
    
    const status = course 
      ? (course.drive_link === task.drive_link ? '✅' : '⚠️') 
      : '❌';
    
    console.log(`${status} Task #${task.id}:`);
    console.log(`   URL: ${task.course_url}`);
    console.log(`   Order ID: ${task.order_id || '(null)'}`);
    console.log(`   Task drive_link: ${task.drive_link ? 'Có' : 'Không'}`);
    if (course) {
      console.log(`   Course ID: ${course.id}`);
      console.log(`   Course drive_link: ${course.drive_link ? 'Có' : 'Không'}`);
      if (course.drive_link !== task.drive_link) {
        console.log(`   ⚠️  Khác nhau!`);
      }
    } else {
      console.log(`   Course: Không tìm thấy`);
    }
    console.log('');
  }
  
  process.exit(0);
}

// Main
const taskId = process.argv[2];

if (!taskId) {
  // List recent tasks
  listRecentCompletedTasks().catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
} else {
  // Debug specific task
  debugTask(parseInt(taskId)).catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}
