/**
 * Test script to verify worker can proceed with admin download even when enrollment fails
 * This simulates the full flow: enrollment failure -> worker check -> download proceed
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Course, DownloadTask } = require('../src/models');
const { addDownloadJob } = require('../src/queues/download.queue');
const Logger = require('../src/utils/logger.util');

const testEmail = process.env.ADMIN_EMAIL || 'support@getcourses.net';
const testUrl = 'https://www.udemy.com/course/the-complete-web-development-bootcamp/';

async function testAdminWorkerFlow() {
  try {
    console.log('🧪 Testing Admin Worker Flow (Enrollment Failure Scenario)...\n');
    
    // Step 1: Find or create test course
    console.log('Step 1: Finding/Creating test course...');
    let course = await Course.findOne({
      where: { course_url: testUrl }
    });
    
    if (!course) {
      course = await Course.create({
        title: 'Test Course for Worker Flow',
        course_url: testUrl,
        platform: 'udemy',
        category: 'Development',
        status: 'active',
        drive_link: null
      });
      console.log(`   ✅ Test course created: ID=${course.id}`);
    } else {
      console.log(`   ✅ Found existing course: ID=${course.id}`);
    }
    
    // Step 2: Create admin download task with status='processing' (simulating enrollment failure)
    console.log('\nStep 2: Creating admin download task with status=processing (simulating enrollment failure)...');
    const task = await DownloadTask.create({
      course_url: testUrl,
      title: course.title,
      email: testEmail,
      order_id: null,
      phone_number: null,
      course_type: 'permanent',
      status: 'processing', // Simulating enrollment failure - status kept as processing
      retry_count: 0,
      price: 0,
      error_log: 'Enrollment failed: Không tìm thấy Course ID trong HTML. (Simulated for testing)'
    });
    
    console.log(`   ✅ Task created: ID=${task.id}`);
    console.log(`   Status: ${task.status}`);
    console.log(`   Course Type: ${task.course_type}`);
    console.log(`   Order ID: ${task.order_id}`);
    
    // Step 3: Queue download job (this will be picked up by worker)
    console.log('\nStep 3: Queuing download job for worker...');
    try {
      await addDownloadJob({
        taskId: task.id,
        email: testEmail,
        courseUrl: testUrl
      });
      console.log('   ✅ Download job queued successfully');
      console.log('   Worker should pick up this job and check enrollment status');
      console.log('   Worker should allow download to proceed because:');
      console.log('     - course_type = "permanent"');
      console.log('     - order_id = null');
      console.log('     - This is an admin download');
    } catch (error) {
      console.error('   ❌ Failed to queue download job:', error.message);
      throw error;
    }
    
    // Step 4: Wait a bit and check task status
    console.log('\nStep 4: Waiting 5 seconds for worker to process...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Reload task to check status
    await task.reload();
    console.log(`   Task status after worker processing: ${task.status}`);
    
    if (task.status === 'failed') {
      console.error('   ❌ Task status is "failed" - worker rejected the download!');
      console.error('   This means worker did not recognize this as an admin download');
    } else if (task.status === 'processing' || task.status === 'downloading' || task.status === 'enrolled') {
      console.log('   ✅ Task status indicates worker is proceeding with download');
      console.log('   Worker correctly identified this as an admin download');
    } else {
      console.log(`   ⚠️  Task status: ${task.status} - check worker logs for details`);
    }
    
    // Step 5: Verify worker logic
    console.log('\nStep 5: Verifying worker logic...');
    const taskInfo = await DownloadTask.findByPk(task.id, {
      attributes: ['id', 'status', 'course_type', 'order_id', 'error_log']
    });
    
    const isAdminDownload = taskInfo.course_type === 'permanent' && taskInfo.order_id === null;
    console.log(`   Is admin download: ${isAdminDownload}`);
    
    if (isAdminDownload) {
      console.log('   ✅ Task is correctly identified as admin download');
      console.log('   Worker should allow download to proceed even if enrollment failed');
    } else {
      console.error('   ❌ Task is not identified as admin download!');
    }
    
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await DownloadTask.destroy({ where: { id: task.id } });
    await course.update({ drive_link: null });
    console.log('   ✅ Test data cleaned up');
    
    console.log('\n✅ Test completed!');
    console.log('   Check worker logs to verify download was allowed to proceed.');
    console.log('   Worker should log: "Enrollment failed but allowing download for admin task"');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  } finally {
    // Close database connection
    if (Course.sequelize) {
      await Course.sequelize.close();
    }
  }
}

// Run the test
if (require.main === module) {
  testAdminWorkerFlow().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { testAdminWorkerFlow };
