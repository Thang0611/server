/**
 * Test script để kiểm tra hàm updateCourseDriveLink
 * Có thể test với task_id thực tế hoặc tạo test case
 * 
 * Usage: 
 *   node scripts/test-update-drive-link.js <task_id> <drive_link>
 *   node scripts/test-update-drive-link.js <task_id>  # Sử dụng drive_link từ task
 */

const adminDownloadService = require('../src/services/adminDownload.service');
const { DownloadTask, Course } = require('../src/models');
const Logger = require('../src/utils/logger.util');

async function testUpdateDriveLink(taskId, driveLink = null) {
  console.log('\n=== TEST UPDATE COURSE DRIVE_LINK ===\n');
  
  // 1. Tìm task
  const task = await DownloadTask.findByPk(taskId, {
    attributes: ['id', 'course_url', 'course_type', 'order_id', 'status', 'drive_link', 'title']
  });
  
  if (!task) {
    console.error(`❌ Task ${taskId} không tồn tại`);
    process.exit(1);
  }
  
  console.log('📋 THÔNG TIN TASK:');
  console.log(JSON.stringify(task.toJSON(), null, 2));
  console.log('');
  
  // 2. Sử dụng drive_link từ task nếu không cung cấp
  const testDriveLink = driveLink || task.drive_link;
  
  if (!testDriveLink) {
    console.error('❌ Task không có drive_link. Vui lòng cung cấp drive_link để test.');
    console.log('   Usage: node scripts/test-update-drive-link.js <task_id> <drive_link>');
    process.exit(1);
  }
  
  console.log(`🔗 Drive Link để test: ${testDriveLink}`);
  console.log('');
  
  // 3. Kiểm tra điều kiện trước khi gọi hàm
  console.log('🔍 KIỂM TRA ĐIỀU KIỆN:');
  const isPermanent = task.course_type === 'permanent';
  const hasNoOrder = task.order_id === null;
  
  console.log(`  - course_type === 'permanent': ${isPermanent} ${isPermanent ? '✅' : '❌'}`);
  console.log(`  - order_id === null: ${hasNoOrder} ${hasNoOrder ? '✅' : '❌'}`);
  console.log('');
  
  if (!isPermanent || !hasNoOrder) {
    console.log('⚠️  Task không phải admin download (cần course_type=permanent và order_id=null)');
    console.log('   Hàm sẽ return: { updated: false, reason: "Not an admin download" }');
    console.log('');
  }
  
  // 4. Tìm course trước khi update
  const { transformToSamsungUdemy, transformToNormalizeUdemyCourseUrl } = require('../src/utils/url.util');
  const { Op } = require('sequelize');
  
  const normalizedUrl = transformToSamsungUdemy(task.course_url) || task.course_url;
  const normalizedUrl2 = transformToNormalizeUdemyCourseUrl(task.course_url) || task.course_url;
  
  console.log('🔍 TÌM COURSE TRƯỚC KHI UPDATE:');
  const courseBefore = await Course.findOne({
    where: {
      [Op.or]: [
        { course_url: task.course_url },
        { course_url: normalizedUrl },
        { course_url: normalizedUrl2 }
      ]
    },
    attributes: ['id', 'title', 'course_url', 'drive_link']
  });
  
  if (courseBefore) {
    console.log('✅ Tìm thấy course:');
    console.log(JSON.stringify(courseBefore.toJSON(), null, 2));
    console.log(`   Drive link hiện tại: ${courseBefore.drive_link || '(null)'}`);
  } else {
    console.log('❌ Không tìm thấy course');
    console.log(`   Task URL: ${task.course_url}`);
    console.log(`   Normalized URL 1: ${normalizedUrl}`);
    console.log(`   Normalized URL 2: ${normalizedUrl2}`);
  }
  console.log('');
  
  // 5. Gọi hàm updateCourseDriveLink
  console.log('🚀 GỌI HÀM updateCourseDriveLink...\n');
  
  try {
    const result = await adminDownloadService.updateCourseDriveLink(taskId, testDriveLink);
    
    console.log('✅ KẾT QUẢ:');
    console.log(JSON.stringify(result, null, 2));
    console.log('');
    
    // 6. Kiểm tra course sau khi update
    if (result.updated) {
      const courseAfter = await Course.findByPk(result.courseId, {
        attributes: ['id', 'title', 'course_url', 'drive_link']
      });
      
      if (courseAfter) {
        console.log('📋 COURSE SAU KHI UPDATE:');
        console.log(JSON.stringify(courseAfter.toJSON(), null, 2));
        console.log('');
        
        if (courseAfter.drive_link === testDriveLink) {
          console.log('✅ THÀNH CÔNG: Course drive_link đã được cập nhật!');
        } else {
          console.log('❌ LỖI: Course drive_link không khớp với drive_link test');
          console.log(`   Expected: ${testDriveLink}`);
          console.log(`   Actual: ${courseAfter.drive_link}`);
        }
      }
    } else {
      console.log(`❌ KHÔNG CẬP NHẬT: ${result.reason}`);
      
      if (result.reason === 'Course not found') {
        console.log('\n💡 GỢI Ý:');
        console.log('   - Kiểm tra xem course có tồn tại trong bảng courses không');
        console.log('   - So sánh URL giữa task và course (có thể format khác nhau)');
        console.log('   - Nếu course chưa tồn tại, cần tạo course trước khi download');
      } else if (result.reason === 'Not an admin download') {
        console.log('\n💡 GỢI Ý:');
        console.log('   - Task phải có course_type = "permanent"');
        console.log('   - Task phải có order_id = null');
      }
    }
    
  } catch (error) {
    console.error('❌ LỖI KHI GỌI HÀM:');
    console.error(error);
    console.error('\nStack trace:');
    console.error(error.stack);
  }
  
  process.exit(0);
}

// Main
const taskId = process.argv[2];
const driveLink = process.argv[3];

if (!taskId) {
  console.error('Usage: node scripts/test-update-drive-link.js <task_id> [drive_link]');
  console.error('');
  console.error('Ví dụ:');
  console.error('  node scripts/test-update-drive-link.js 123');
  console.error('  node scripts/test-update-drive-link.js 123 "https://drive.google.com/..."');
  process.exit(1);
}

testUpdateDriveLink(parseInt(taskId), driveLink).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
