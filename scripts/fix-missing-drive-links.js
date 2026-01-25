/**
 * Script để cập nhật drive_link cho các courses từ tasks permanent đã completed
 * Xử lý trường hợp URL không khớp chính xác (samsungu. vs www.)
 */

const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

// Load environment variables
const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = nodeEnv === 'development' 
    ? path.join(__dirname, '../../.env.development')
    : path.join(__dirname, '../../.env');

if (fs.existsSync(envFile)) {
    require('dotenv').config({ path: envFile });
} else {
    require('dotenv').config();
}

async function fixMissingDriveLinks() {
  console.log('\n=== CẬP NHẬT DRIVE_LINK CHO COURSES ===\n');
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'udemy_bot',
    charset: 'utf8mb4'
  });
  
  try {
    // 1. Tìm tất cả tasks permanent đã completed (admin downloads)
    const [tasks] = await connection.execute(`
      SELECT id, course_url, title, drive_link
      FROM download_tasks
      WHERE course_type = 'permanent'
        AND status = 'completed'
        AND drive_link IS NOT NULL
        AND order_id IS NULL
      ORDER BY id DESC
    `);
    
    console.log(`Tìm thấy ${tasks.length} tasks permanent completed (admin downloads)\n`);
    
    if (tasks.length === 0) {
      console.log('Không có task nào để cập nhật.');
      process.exit(0);
    }
    
    // 2. Với mỗi task, tìm course tương ứng và cập nhật
    const results = {
      updated: [],
      notFound: [],
      alreadyUpdated: []
    };
    
    for (const task of tasks) {
      console.log(`\n📋 Xử lý Task #${task.id}: ${task.title}`);
      console.log(`   Task URL: ${task.course_url}`);
      console.log(`   Task Drive Link: ${task.drive_link}`);
      
      // Tạo các biến thể URL để tìm course
      const taskUrl = task.course_url;
      const urlVariants = [
        taskUrl,
        taskUrl.replace('samsungu.', 'www.'),
        taskUrl.replace('www.', 'samsungu.'),
        taskUrl.replace('samsungu.', ''),
        taskUrl.replace('www.', '')
      ];
      
      // Tìm course - tạo placeholders cho IN clause
      const placeholders = urlVariants.map(() => '?').join(',');
      const [courses] = await connection.execute(`
        SELECT id, course_url, title, drive_link
        FROM courses
        WHERE course_url IN (${placeholders})
        LIMIT 1
      `, urlVariants);
      
      if (courses.length === 0) {
        // Thử tìm bằng slug
        const slug = taskUrl.split('/').pop()?.split('?')[0];
        if (slug) {
          const [coursesBySlug] = await connection.execute(`
            SELECT id, course_url, title, drive_link
            FROM courses
            WHERE course_url LIKE ?
            LIMIT 1
          `, [`%${slug}%`]);
          
          if (coursesBySlug.length > 0) {
            courses.push(coursesBySlug[0]);
          }
        }
      }
      
      if (courses.length === 0) {
        console.log(`   ❌ Không tìm thấy course tương ứng`);
        results.notFound.push({ task });
        continue;
      }
      
      const course = courses[0];
      console.log(`   ✅ Tìm thấy Course #${course.id}: ${course.title}`);
      console.log(`   Course URL: ${course.course_url}`);
      console.log(`   Course Drive Link hiện tại: ${course.drive_link || '(null)'}`);
      
      // Kiểm tra xem đã có drive_link chưa
      if (course.drive_link === task.drive_link) {
        console.log(`   ✅ Course đã có drive_link giống nhau`);
        results.alreadyUpdated.push({ task, course });
        continue;
      }
      
      // Cập nhật drive_link
      console.log(`   🔄 Đang cập nhật drive_link...`);
      await connection.execute(`
        UPDATE courses
        SET drive_link = ?, updated_at = NOW()
        WHERE id = ?
      `, [task.drive_link, course.id]);
      
      console.log(`   ✅ Đã cập nhật thành công!`);
      results.updated.push({ task, course });
    }
    
    // 3. Tóm tắt kết quả
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 TÓM TẮT KẾT QUẢ\n');
    console.log(`  ✅ Đã cập nhật: ${results.updated.length}`);
    console.log(`  ✅ Đã có sẵn: ${results.alreadyUpdated.length}`);
    console.log(`  ❌ Không tìm thấy course: ${results.notFound.length}`);
    console.log('');
    
    if (results.updated.length > 0) {
      console.log('✅ CÁC COURSES ĐÃ ĐƯỢC CẬP NHẬT:\n');
      results.updated.forEach(({ task, course }) => {
        console.log(`  Task #${task.id} → Course #${course.id}: ${course.title}`);
        console.log(`    Drive Link: ${task.drive_link}`);
      });
      console.log('');
    }
    
    if (results.notFound.length > 0) {
      console.log('❌ CÁC TASKS KHÔNG TÌM THẤY COURSE:\n');
      results.notFound.forEach(({ task }) => {
        console.log(`  Task #${task.id}: ${task.title}`);
        console.log(`    URL: ${task.course_url}`);
      });
      console.log('');
    }
    
  } finally {
    await connection.end();
  }
  
  process.exit(0);
}

fixMissingDriveLinks().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
