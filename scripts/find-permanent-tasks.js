/**
 * Tìm tất cả tasks permanent trong database
 */

const { DownloadTask, Course } = require('../src/models');
const { Op } = require('sequelize');

async function findPermanentTasks() {
  console.log('\n=== TÌM TẤT CẢ TASKS PERMANENT ===\n');
  
  const tasks = await DownloadTask.findAll({
    where: { course_type: 'permanent' },
    attributes: ['id', 'course_url', 'title', 'order_id', 'status', 'drive_link', 'error_log', 'created_at', 'updated_at'],
    order: [['updated_at', 'DESC']],
    limit: 100
  });
  
  console.log(`Tìm thấy ${tasks.length} tasks permanent:\n`);
  
  if (tasks.length === 0) {
    console.log('Không có task permanent nào trong database.');
    console.log('\nBạn có thể:');
    console.log('1. Tạo một task permanent mới qua admin panel');
    console.log('2. Hoặc cung cấp task_id cụ thể để debug');
    process.exit(0);
  }
  
  for (const task of tasks) {
    console.log(`\n📋 Task #${task.id}:`);
    console.log(`   Status: ${task.status}`);
    console.log(`   Order ID: ${task.order_id || '(null)'}`);
    console.log(`   Drive Link: ${task.drive_link ? '✅ Có' : '❌ Không'}`);
    console.log(`   URL: ${task.course_url}`);
    console.log(`   Title: ${task.title || '(null)'}`);
    console.log(`   Updated: ${task.updated_at}`);
    
    if (task.error_log) {
      console.log(`   Error: ${task.error_log.substring(0, 150)}`);
    }
    
    // Kiểm tra course tương ứng
    if (task.status === 'completed' && task.drive_link) {
      const { transformToSamsungUdemy, transformToNormalizeUdemyCourseUrl } = require('../src/utils/url.util');
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
      
      if (course) {
        if (course.drive_link === task.drive_link) {
          console.log(`   Course: ✅ Đã cập nhật (ID: ${course.id})`);
        } else {
          console.log(`   Course: ⚠️  Khác nhau! (ID: ${course.id}, drive_link: ${course.drive_link ? 'Có' : 'Không'})`);
        }
      } else {
        console.log(`   Course: ❌ Không tìm thấy`);
      }
    }
  }
  
  // Tìm tasks có vấn đề
  console.log('\n\n=== TASKS CÓ VẤN ĐỀ ===\n');
  
  const problematicTasks = tasks.filter(t => {
    return t.status === 'completed' && t.drive_link && t.order_id === null;
  });
  
  if (problematicTasks.length > 0) {
    console.log(`Tìm thấy ${problematicTasks.length} tasks completed nhưng có thể chưa update course:\n`);
    problematicTasks.forEach(t => {
      console.log(`  Task #${t.id} - ${t.title || t.course_url}`);
    });
    console.log('\nChạy debug với: node scripts/debug-admin-drive-link.js <task_id>');
  } else {
    console.log('Không tìm thấy tasks completed có vấn đề.');
  }
  
  process.exit(0);
}

findPermanentTasks().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
