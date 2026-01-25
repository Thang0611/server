/**
 * Đọc và phân tích dữ liệu từ database udemy_bot
 * Đọc trực tiếp từ bảng download_tasks và courses
 */

const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

// Load environment variables giống như database.js
const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = nodeEnv === 'development' 
    ? path.join(__dirname, '../../.env.development')
    : path.join(__dirname, '../../.env');

if (fs.existsSync(envFile)) {
    require('dotenv').config({ path: envFile });
} else {
    require('dotenv').config();
}

async function readUdemyBotDatabase() {
  console.log('\n=== ĐỌC DATABASE udemy_bot ===\n');
  
  // Kết nối database
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'udemy_bot',
    charset: 'utf8mb4'
  });
  
  try {
    // 1. Đọc bảng download_tasks
    console.log('📋 BẢNG download_tasks:\n');
    const [tasks] = await connection.execute(`
      SELECT 
        id, order_id, email, course_url, title, price, status, 
        drive_link, retry_count, error_log, course_type, category,
        created_at, updated_at
      FROM download_tasks
      ORDER BY id DESC
      LIMIT 500
    `);
    
    console.log(`Tổng số tasks: ${tasks.length}\n`);
    
    if (tasks.length > 0) {
      // Hiển thị 20 tasks mới nhất
      console.log('Danh sách tasks (20 mới nhất):\n');
      tasks.slice(0, 20).forEach(task => {
        console.log(`Task #${task.id}:`);
        console.log(`  Order ID: ${task.order_id || '(null)'}`);
        console.log(`  Email: ${task.email}`);
        console.log(`  Course Type: ${task.course_type}`);
        console.log(`  Status: ${task.status}`);
        console.log(`  Title: ${task.title || '(null)'}`);
        console.log(`  URL: ${task.course_url}`);
        console.log(`  Drive Link: ${task.drive_link ? '✅ Có' : '❌ Không'}`);
        if (task.error_log) {
          console.log(`  Error: ${task.error_log.substring(0, 100)}`);
        }
        console.log(`  Updated: ${task.updated_at}`);
        console.log('');
      });
      
      // Thống kê
      const permanentTasks = tasks.filter(t => t.course_type === 'permanent');
      const temporaryTasks = tasks.filter(t => t.course_type === 'temporary');
      const completedTasks = tasks.filter(t => t.status === 'completed');
      const permanentCompleted = permanentTasks.filter(t => t.status === 'completed' && t.drive_link);
      const adminDownloads = permanentTasks.filter(t => t.order_id === null);
      const adminCompleted = adminDownloads.filter(t => t.status === 'completed' && t.drive_link);
      
      console.log('\n📊 THỐNG KÊ download_tasks:\n');
      console.log(`  Tổng số: ${tasks.length}`);
      console.log(`  Permanent: ${permanentTasks.length}`);
      console.log(`  Temporary: ${temporaryTasks.length}`);
      console.log(`  Completed: ${completedTasks.length}`);
      console.log(`  Permanent Completed: ${permanentCompleted.length}`);
      console.log(`  Admin Downloads (order_id=null): ${adminDownloads.length}`);
      console.log(`  Admin Completed: ${adminCompleted.length}`);
      console.log('');
      
      // Tasks permanent completed (admin downloads)
      if (adminCompleted.length > 0) {
        console.log('📋 TASKS PERMANENT COMPLETED (ADMIN DOWNLOADS):\n');
        adminCompleted.forEach(task => {
          console.log(`  Task #${task.id}: ${task.title || task.course_url}`);
          console.log(`    URL: ${task.course_url}`);
          console.log(`    Drive Link: ${task.drive_link}`);
          console.log('');
        });
      }
    }
    
    // 2. Đọc bảng courses
    console.log('\n' + '='.repeat(80));
    console.log('📋 BẢNG courses:\n');
    const [courses] = await connection.execute(`
      SELECT 
        id, course_url, title, thumbnail, instructor, rating, students,
        duration, lectures, category, platform, description, price,
        original_price, bestseller, drive_link, status,
        total_sections, total_lectures, total_duration_seconds,
        created_at, updated_at
      FROM courses
      ORDER BY id DESC
      LIMIT 500
    `);
    
    console.log(`Tổng số courses: ${courses.length}\n`);
    
    if (courses.length > 0) {
      // Hiển thị 20 courses mới nhất
      console.log('Danh sách courses (20 mới nhất):\n');
      courses.slice(0, 20).forEach(course => {
        console.log(`Course #${course.id}:`);
        console.log(`  Title: ${course.title || '(null)'}`);
        console.log(`  URL: ${course.course_url}`);
        console.log(`  Drive Link: ${course.drive_link ? '✅ Có' : '❌ Không'}`);
        console.log(`  Status: ${course.status}`);
        console.log(`  Updated: ${course.updated_at}`);
        console.log('');
      });
      
      // Thống kê
      const coursesWithDriveLink = courses.filter(c => c.drive_link);
      const coursesWithoutDriveLink = courses.filter(c => !c.drive_link);
      
      console.log('\n📊 THỐNG KÊ courses:\n');
      console.log(`  Tổng số: ${courses.length}`);
      console.log(`  Có drive_link: ${coursesWithDriveLink.length}`);
      console.log(`  Không có drive_link: ${coursesWithoutDriveLink.length}`);
      console.log('');
    }
    
    // 3. So sánh tasks permanent completed với courses
    if (tasks.length > 0 && courses.length > 0) {
      console.log('='.repeat(80));
      console.log('🔍 SO SÁNH TASKS PERMANENT COMPLETED VỚI COURSES\n');
      
      const adminCompletedTasks = tasks.filter(
        t => t.course_type === 'permanent' && 
             t.status === 'completed' && 
             t.drive_link && 
             t.order_id === null
      );
      
      console.log(`Tasks permanent completed (admin): ${adminCompletedTasks.length}`);
      console.log(`Courses: ${courses.length}\n`);
      
      if (adminCompletedTasks.length > 0) {
        console.log('Chi tiết so sánh:\n');
        
        const analysis = {
          matched: [],
          notMatched: [],
          driveLinkMismatch: []
        };
        
        for (const task of adminCompletedTasks) {
          // Tìm course tương ứng
          const taskUrl = task.course_url;
          const taskSlug = taskUrl.split('/').pop()?.split('?')[0];
          
          const matchingCourses = courses.filter(c => {
            const courseUrl = c.course_url;
            const courseSlug = courseUrl.split('/').pop()?.split('?')[0];
            
            // So sánh exact URL hoặc slug
            return courseUrl === taskUrl ||
                   courseUrl === taskUrl.replace('samsungu.', 'www.') ||
                   courseUrl === taskUrl.replace('www.', 'samsungu.') ||
                   (taskSlug && courseSlug && taskSlug === courseSlug);
          });
          
          if (matchingCourses.length > 0) {
            const course = matchingCourses[0];
            if (course.drive_link === task.drive_link) {
              analysis.matched.push({ task, course });
            } else {
              analysis.driveLinkMismatch.push({ task, course });
            }
          } else {
            analysis.notMatched.push({ task });
          }
        }
        
        // Hiển thị kết quả
        if (analysis.matched.length > 0) {
          console.log(`✅ Tasks có course và drive_link khớp: ${analysis.matched.length}\n`);
        }
        
        if (analysis.driveLinkMismatch.length > 0) {
          console.log(`⚠️  Tasks có course nhưng drive_link KHÔNG khớp: ${analysis.driveLinkMismatch.length}\n`);
          analysis.driveLinkMismatch.forEach(({ task, course }) => {
            console.log(`  Task #${task.id} vs Course #${course.id}:`);
            console.log(`    Task URL: ${task.course_url}`);
            console.log(`    Course URL: ${course.course_url}`);
            console.log(`    Task Drive: ${task.drive_link}`);
            console.log(`    Course Drive: ${course.drive_link || '(null)'}`);
            console.log('');
          });
        }
        
        if (analysis.notMatched.length > 0) {
          console.log(`❌ Tasks KHÔNG có course tương ứng: ${analysis.notMatched.length}\n`);
          analysis.notMatched.forEach(({ task }) => {
            console.log(`  Task #${task.id}: ${task.title || task.course_url}`);
            console.log(`    URL: ${task.course_url}`);
            console.log(`    Drive Link: ${task.drive_link}`);
            console.log('');
          });
          
          console.log('💡 GIẢI PHÁP:');
          console.log('   - Cần tạo courses trong bảng courses với URL tương ứng');
          console.log('   - Hoặc cập nhật URL trong courses để khớp với tasks');
          console.log('');
        }
      }
    }
    
  } finally {
    await connection.end();
  }
  
  process.exit(0);
}

readUdemyBotDatabase().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
