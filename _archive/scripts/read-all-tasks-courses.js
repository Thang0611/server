/**
 * Đọc tất cả dữ liệu từ bảng download_tasks và courses
 * Hiển thị chi tiết để phân tích
 */

const { DownloadTask, Course } = require('../src/models');
const { Op } = require('sequelize');

async function readAllData() {
  console.log('\n=== ĐỌC TẤT CẢ DỮ LIỆU ===\n');
  
  // 1. Đọc TẤT CẢ tasks (không filter)
  console.log('📋 BẢNG download_tasks:\n');
  const allTasks = await DownloadTask.findAll({
    attributes: ['id', 'course_url', 'title', 'order_id', 'course_type', 'status', 'drive_link', 'error_log', 'email', 'created_at', 'updated_at'],
    order: [['id', 'DESC']],
    limit: 500
  });
  
  console.log(`Tổng số tasks: ${allTasks.length}\n`);
  
  if (allTasks.length > 0) {
    console.log('Danh sách tasks (20 mới nhất):\n');
    allTasks.slice(0, 20).forEach(task => {
      console.log(`Task #${task.id}:`);
      console.log(`  Course Type: ${task.course_type}`);
      console.log(`  Status: ${task.status}`);
      console.log(`  Order ID: ${task.order_id || '(null)'}`);
      console.log(`  Email: ${task.email}`);
      console.log(`  Title: ${task.title || '(null)'}`);
      console.log(`  URL: ${task.course_url}`);
      console.log(`  Drive Link: ${task.drive_link ? '✅ Có' : '❌ Không'}`);
      if (task.error_log) {
        console.log(`  Error: ${task.error_log.substring(0, 100)}`);
      }
      console.log(`  Updated: ${task.updated_at}`);
      console.log('');
    });
    
    // Thống kê theo course_type
    const permanentTasks = allTasks.filter(t => t.course_type === 'permanent');
    const temporaryTasks = allTasks.filter(t => t.course_type === 'temporary');
    
    console.log('\n📊 THỐNG KÊ THEO COURSE_TYPE:');
    console.log(`  Permanent: ${permanentTasks.length}`);
    console.log(`  Temporary: ${temporaryTasks.length}`);
    console.log('');
    
    // Thống kê theo status
    const statusCounts = {};
    allTasks.forEach(t => {
      statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
    });
    console.log('📊 THỐNG KÊ THEO STATUS:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });
    console.log('');
    
    // Tasks permanent đã completed
    const permanentCompleted = permanentTasks.filter(t => t.status === 'completed' && t.drive_link);
    console.log(`📊 TASKS PERMANENT ĐÃ COMPLETED: ${permanentCompleted.length}`);
    if (permanentCompleted.length > 0) {
      console.log('\nDanh sách:\n');
      permanentCompleted.forEach(task => {
        console.log(`  Task #${task.id}: ${task.title || task.course_url}`);
        console.log(`    Order ID: ${task.order_id || '(null)'}`);
        console.log(`    Drive Link: ${task.drive_link}`);
        console.log('');
      });
    }
  }
  
  // 2. Đọc TẤT CẢ courses
  console.log('\n' + '='.repeat(80));
  console.log('📋 BẢNG courses:\n');
  const allCourses = await Course.findAll({
    attributes: ['id', 'course_url', 'title', 'drive_link', 'status', 'created_at', 'updated_at'],
    order: [['id', 'DESC']],
    limit: 500
  });
  
  console.log(`Tổng số courses: ${allCourses.length}\n`);
  
  if (allCourses.length > 0) {
    console.log('Danh sách courses (20 mới nhất):\n');
    allCourses.slice(0, 20).forEach(course => {
      console.log(`Course #${course.id}:`);
      console.log(`  Title: ${course.title || '(null)'}`);
      console.log(`  URL: ${course.course_url}`);
      console.log(`  Drive Link: ${course.drive_link ? '✅ Có' : '❌ Không'}`);
      console.log(`  Status: ${course.status}`);
      console.log(`  Updated: ${course.updated_at}`);
      console.log('');
    });
    
    // Thống kê
    const coursesWithDriveLink = allCourses.filter(c => c.drive_link);
    const coursesWithoutDriveLink = allCourses.filter(c => !c.drive_link);
    
    console.log('\n📊 THỐNG KÊ:');
    console.log(`  Có drive_link: ${coursesWithDriveLink.length}`);
    console.log(`  Không có drive_link: ${coursesWithoutDriveLink.length}`);
    console.log('');
  }
  
  // 3. So sánh tasks permanent completed với courses
  if (allTasks.length > 0 && allCourses.length > 0) {
    console.log('='.repeat(80));
    console.log('🔍 SO SÁNH TASKS PERMANENT COMPLETED VỚI COURSES\n');
    
    const permanentCompletedTasks = allTasks.filter(
      t => t.course_type === 'permanent' && t.status === 'completed' && t.drive_link
    );
    
    console.log(`Tasks permanent completed: ${permanentCompletedTasks.length}`);
    console.log(`Courses: ${allCourses.length}\n`);
    
    if (permanentCompletedTasks.length > 0) {
      console.log('Chi tiết so sánh:\n');
      
      for (const task of permanentCompletedTasks) {
        console.log(`Task #${task.id}: ${task.title || task.course_url}`);
        console.log(`  Task URL: ${task.course_url}`);
        console.log(`  Task Drive Link: ${task.drive_link}`);
        console.log(`  Order ID: ${task.order_id || '(null)'}`);
        
        // Tìm course tương ứng
        const matchingCourses = allCourses.filter(c => {
          const taskSlug = task.course_url.split('/').pop()?.split('?')[0];
          const courseSlug = c.course_url.split('/').pop()?.split('?')[0];
          return taskSlug && courseSlug && taskSlug === courseSlug;
        });
        
        if (matchingCourses.length > 0) {
          console.log(`  ✅ Tìm thấy ${matchingCourses.length} course(s) tương ứng:`);
          matchingCourses.forEach(c => {
            console.log(`     Course #${c.id}: ${c.course_url}`);
            console.log(`       Drive Link: ${c.drive_link || '(null)'}`);
            if (c.drive_link !== task.drive_link) {
              console.log(`       ⚠️  Drive link KHÔNG khớp!`);
            } else if (c.drive_link === task.drive_link) {
              console.log(`       ✅ Drive link khớp!`);
            }
          });
        } else {
          console.log(`  ❌ Không tìm thấy course tương ứng`);
        }
        console.log('');
      }
    }
  }
  
  process.exit(0);
}

readAllData().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
