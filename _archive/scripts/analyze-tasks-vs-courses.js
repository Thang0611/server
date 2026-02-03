/**
 * Đọc và phân tích dữ liệu từ bảng download_tasks và courses
 * So sánh và tìm ra vấn đề tại sao drive_link không được cập nhật
 */

const { DownloadTask, Course } = require('../src/models');
const { Op } = require('sequelize');
const { transformToSamsungUdemy, transformToNormalizeUdemyCourseUrl } = require('../src/utils/url.util');

async function analyzeTasksVsCourses() {
  console.log('\n=== PHÂN TÍCH BẢNG download_tasks VÀ courses ===\n');
  
  // 1. Đọc tất cả tasks permanent
  console.log('📋 ĐỌC BẢNG download_tasks (permanent)...\n');
  const allPermanentTasks = await DownloadTask.findAll({
    where: { course_type: 'permanent' },
    attributes: ['id', 'course_url', 'title', 'order_id', 'status', 'drive_link', 'error_log', 'created_at', 'updated_at'],
    order: [['updated_at', 'DESC']],
    limit: 200
  });
  
  console.log(`Tìm thấy ${allPermanentTasks.length} tasks permanent\n`);
  
  // 2. Đọc tất cả courses
  console.log('📋 ĐỌC BẢNG courses...\n');
  const allCourses = await Course.findAll({
    attributes: ['id', 'course_url', 'title', 'drive_link', 'status', 'created_at', 'updated_at'],
    order: [['updated_at', 'DESC']],
    limit: 200
  });
  
  console.log(`Tìm thấy ${allCourses.length} courses\n`);
  
  // 3. Phân tích tasks đã completed
  console.log('='.repeat(80));
  console.log('📊 PHÂN TÍCH TASKS PERMANENT ĐÃ COMPLETED\n');
  
  const completedTasks = allPermanentTasks.filter(t => t.status === 'completed' && t.drive_link);
  console.log(`Tasks đã completed có drive_link: ${completedTasks.length}\n`);
  
  if (completedTasks.length === 0) {
    console.log('Không có task nào đã completed.');
  } else {
    console.log('Danh sách tasks completed:\n');
    completedTasks.forEach((task, index) => {
      console.log(`${index + 1}. Task #${task.id}:`);
      console.log(`   Title: ${task.title || '(null)'}`);
      console.log(`   URL: ${task.course_url}`);
      console.log(`   Order ID: ${task.order_id || '(null)'}`);
      console.log(`   Drive Link: ${task.drive_link}`);
      console.log(`   Updated: ${task.updated_at}`);
      console.log('');
    });
  }
  
  // 4. So sánh tasks với courses
  console.log('='.repeat(80));
  console.log('🔍 SO SÁNH TASKS VỚI COURSES\n');
  
  const analysis = {
    tasksWithMatchingCourse: [],
    tasksWithoutCourse: [],
    coursesWithMatchingTask: [],
    coursesWithoutTask: [],
    driveLinkMismatches: []
  };
  
  // Kiểm tra từng task completed
  for (const task of completedTasks) {
    const normalizedUrl = transformToSamsungUdemy(task.course_url) || task.course_url;
    const normalizedUrl2 = transformToNormalizeUdemyCourseUrl(task.course_url) || task.course_url;
    
    // Tìm course tương ứng
    const matchingCourse = allCourses.find(c => {
      return c.course_url === task.course_url ||
             c.course_url === normalizedUrl ||
             c.course_url === normalizedUrl2 ||
             c.course_url.includes(task.course_url.split('/').pop()?.split('?')[0] || '');
    });
    
    if (matchingCourse) {
      analysis.tasksWithMatchingCourse.push({ task, course: matchingCourse });
      
      // Kiểm tra drive_link
      if (matchingCourse.drive_link !== task.drive_link) {
        analysis.driveLinkMismatches.push({
          task,
          course: matchingCourse,
          taskDriveLink: task.drive_link,
          courseDriveLink: matchingCourse.drive_link
        });
      }
    } else {
      analysis.tasksWithoutCourse.push({ task });
    }
  }
  
  // Kiểm tra courses có drive_link
  const coursesWithDriveLink = allCourses.filter(c => c.drive_link);
  console.log(`Courses có drive_link: ${coursesWithDriveLink.length}\n`);
  
  // 5. Báo cáo kết quả
  console.log('='.repeat(80));
  console.log('📊 KẾT QUẢ PHÂN TÍCH\n');
  
  console.log(`✅ Tasks có course tương ứng: ${analysis.tasksWithMatchingCourse.length}`);
  console.log(`❌ Tasks KHÔNG có course: ${analysis.tasksWithoutCourse.length}`);
  console.log(`⚠️  Drive link không khớp: ${analysis.driveLinkMismatches.length}`);
  console.log('');
  
  // Chi tiết tasks không có course
  if (analysis.tasksWithoutCourse.length > 0) {
    console.log('❌ TASKS KHÔNG CÓ COURSE TƯƠNG ỨNG:\n');
    analysis.tasksWithoutCourse.forEach(({ task }, index) => {
      console.log(`${index + 1}. Task #${task.id}:`);
      console.log(`   Title: ${task.title || '(null)'}`);
      console.log(`   URL: ${task.course_url}`);
      console.log(`   Drive Link: ${task.drive_link}`);
      console.log(`   Order ID: ${task.order_id || '(null)'}`);
      console.log('');
    });
    
    console.log('💡 GIẢI PHÁP:');
    console.log('   - Cần tạo courses trong bảng courses với URL tương ứng');
    console.log('   - Hoặc cập nhật URL trong courses để khớp với tasks');
    console.log('');
  }
  
  // Chi tiết drive link không khớp
  if (analysis.driveLinkMismatches.length > 0) {
    console.log('⚠️  DRIVE LINK KHÔNG KHỚP:\n');
    analysis.driveLinkMismatches.forEach(({ task, course, taskDriveLink, courseDriveLink }, index) => {
      console.log(`${index + 1}. Task #${task.id} vs Course #${course.id}:`);
      console.log(`   Task URL: ${task.course_url}`);
      console.log(`   Course URL: ${course.course_url}`);
      console.log(`   Task Drive Link: ${taskDriveLink}`);
      console.log(`   Course Drive Link: ${courseDriveLink || '(null)'}`);
      console.log('');
    });
    
    console.log('💡 GIẢI PHÁP:');
    console.log('   - Cần cập nhật course.drive_link = task.drive_link');
    console.log('   - Chạy script: node scripts/update-missing-drive-links.js');
    console.log('');
  }
  
  // Tasks có course và drive_link khớp
  const tasksWithMatchingDriveLink = analysis.tasksWithMatchingCourse.filter(
    ({ task, course }) => course.drive_link === task.drive_link
  );
  
  if (tasksWithMatchingDriveLink.length > 0) {
    console.log(`✅ TASKS ĐÃ CẬP NHẬT ĐÚNG: ${tasksWithMatchingDriveLink.length}\n`);
  }
  
  // 6. Thống kê tổng quan
  console.log('='.repeat(80));
  console.log('📈 THỐNG KÊ TỔNG QUAN\n');
  
  const stats = {
    totalPermanentTasks: allPermanentTasks.length,
    completedTasks: completedTasks.length,
    failedTasks: allPermanentTasks.filter(t => t.status === 'failed').length,
    processingTasks: allPermanentTasks.filter(t => ['processing', 'enrolled', 'pending'].includes(t.status)).length,
    tasksWithDriveLink: allPermanentTasks.filter(t => t.drive_link).length,
    tasksWithoutDriveLink: allPermanentTasks.filter(t => !t.drive_link).length,
    adminDownloads: allPermanentTasks.filter(t => t.order_id === null).length,
    orderDownloads: allPermanentTasks.filter(t => t.order_id !== null).length,
    totalCourses: allCourses.length,
    coursesWithDriveLink: allCourses.filter(c => c.drive_link).length,
    coursesWithoutDriveLink: allCourses.filter(c => !c.drive_link).length
  };
  
  console.log('📋 DOWNLOAD_TASKS (permanent):');
  console.log(`   Tổng số: ${stats.totalPermanentTasks}`);
  console.log(`   Completed: ${stats.completedTasks}`);
  console.log(`   Failed: ${stats.failedTasks}`);
  console.log(`   Processing/Enrolled/Pending: ${stats.processingTasks}`);
  console.log(`   Có drive_link: ${stats.tasksWithDriveLink}`);
  console.log(`   Không có drive_link: ${stats.tasksWithoutDriveLink}`);
  console.log(`   Admin downloads (order_id=null): ${stats.adminDownloads}`);
  console.log(`   Order downloads (order_id!=null): ${stats.orderDownloads}`);
  console.log('');
  
  console.log('📋 COURSES:');
  console.log(`   Tổng số: ${stats.totalCourses}`);
  console.log(`   Có drive_link: ${stats.coursesWithDriveLink}`);
  console.log(`   Không có drive_link: ${stats.coursesWithoutDriveLink}`);
  console.log('');
  
  // 7. Đề xuất hành động
  console.log('='.repeat(80));
  console.log('💡 ĐỀ XUẤT HÀNH ĐỘNG\n');
  
  if (analysis.tasksWithoutCourse.length > 0) {
    console.log(`1. Tạo ${analysis.tasksWithoutCourse.length} courses thiếu:`);
    console.log('   node scripts/create-missing-courses.js');
    console.log('');
  }
  
  if (analysis.driveLinkMismatches.length > 0) {
    console.log(`2. Cập nhật ${analysis.driveLinkMismatches.length} drive_links không khớp:`);
    console.log('   node scripts/update-missing-drive-links.js');
    console.log('');
  }
  
  if (analysis.tasksWithMatchingCourse.length > 0 && analysis.driveLinkMismatches.length === 0) {
    console.log('✅ Tất cả tasks đã được cập nhật đúng!');
  }
  
  process.exit(0);
}

analyzeTasksVsCourses().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
