/**
 * Phân tích các tasks permanent đã completed nhưng course không tồn tại
 * và đề xuất giải pháp
 */

const { DownloadTask, Course } = require('../src/models');
const { Op } = require('sequelize');
const { transformToSamsungUdemy, transformToNormalizeUdemyCourseUrl } = require('../src/utils/url.util');

async function analyzeMissingCourses() {
  console.log('\n=== PHÂN TÍCH TASKS PERMANENT THIẾU COURSE ===\n');
  
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
  
  console.log(`Tìm thấy ${tasks.length} tasks permanent đã completed (admin downloads)\n`);
  
  if (tasks.length === 0) {
    console.log('Không có task nào để phân tích.');
    process.exit(0);
  }
  
  const missingCourses = [];
  const foundCourses = [];
  
  for (const task of tasks) {
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
    
    if (course) {
      foundCourses.push({ task, course });
    } else {
      missingCourses.push({ task });
    }
  }
  
  console.log(`\n📊 KẾT QUẢ PHÂN TÍCH:\n`);
  console.log(`  ✅ Tasks có course: ${foundCourses.length}`);
  console.log(`  ❌ Tasks thiếu course: ${missingCourses.length}`);
  console.log('');
  
  // Phân tích tasks có course
  if (foundCourses.length > 0) {
    console.log('✅ TASKS CÓ COURSE:\n');
    for (const { task, course } of foundCourses) {
      const driveLinkMatch = course.drive_link === task.drive_link;
      const status = driveLinkMatch ? '✅ Đã cập nhật' : '⚠️  Chưa cập nhật';
      
      console.log(`  Task #${task.id}: ${task.title || task.course_url}`);
      console.log(`    Course ID: ${course.id}`);
      console.log(`    Task drive_link: ${task.drive_link ? 'Có' : 'Không'}`);
      console.log(`    Course drive_link: ${course.drive_link ? 'Có' : 'Không'}`);
      console.log(`    Status: ${status}`);
      if (!driveLinkMatch && course.drive_link) {
        console.log(`    ⚠️  Drive link khác nhau!`);
        console.log(`       Task: ${task.drive_link}`);
        console.log(`       Course: ${course.drive_link}`);
      }
      console.log('');
    }
  }
  
  // Phân tích tasks thiếu course
  if (missingCourses.length > 0) {
    console.log('❌ TASKS THIẾU COURSE:\n');
    for (const { task } of missingCourses) {
      console.log(`  Task #${task.id}: ${task.title || task.course_url}`);
      console.log(`    URL: ${task.course_url}`);
      console.log(`    Drive Link: ${task.drive_link}`);
      console.log(`    Updated: ${task.updated_at}`);
      console.log('');
    }
    
    console.log('\n💡 GIẢI PHÁP:\n');
    console.log('1. Tạo courses trong bảng courses với URL tương ứng');
    console.log('2. Sau đó chạy script để cập nhật drive_link:');
    console.log('');
    console.log('   node scripts/update-missing-drive-links.js');
    console.log('');
    console.log('3. Hoặc cập nhật thủ công từng course:');
    console.log('');
    missingCourses.forEach(({ task }) => {
      console.log(`   UPDATE courses SET drive_link = '${task.drive_link}' WHERE course_url = '${task.course_url}';`);
    });
  }
  
  // Tạo script SQL để cập nhật
  if (missingCourses.length > 0) {
    console.log('\n📝 SCRIPT SQL ĐỀ XUẤT:\n');
    console.log('-- Cập nhật drive_link cho các courses thiếu');
    console.log('-- Lưu ý: Cần tạo courses trước nếu chưa có\n');
    
    missingCourses.forEach(({ task }) => {
      const urlVariants = [
        task.course_url,
        transformToSamsungUdemy(task.course_url) || task.course_url,
        transformToNormalizeUdemyCourseUrl(task.course_url) || task.course_url
      ].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates
      
      console.log(`-- Task #${task.id}: ${task.title || task.course_url}`);
      console.log(`UPDATE courses SET drive_link = '${task.drive_link}'`);
      console.log(`WHERE course_url IN (${urlVariants.map(u => `'${u}'`).join(', ')});`);
      console.log('');
    });
  }
  
  process.exit(0);
}

analyzeMissingCourses().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
