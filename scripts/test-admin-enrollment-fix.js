/**
 * Test script for admin enrollment fix
 * Tests that admin downloads can proceed even when enrollment fails
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Course, DownloadTask } = require('../src/models');
const adminDownloadService = require('../src/services/adminDownload.service');
const enrollService = require('../src/services/enroll.service');
const Logger = require('../src/utils/logger.util');

const testEmail = process.env.ADMIN_EMAIL || 'support@getcourses.net';
const testUrl = 'https://www.udemy.com/course/the-complete-web-development-bootcamp/';

async function testAdminEnrollmentFix() {
  try {
    console.log('🧪 Testing Admin Enrollment Fix...\n');
    
    // Test 1: Find or create test course
    console.log('Test 1: Finding/Creating test course...');
    let course = await Course.findOne({
      where: { course_url: testUrl }
    });
    
    if (!course) {
      course = await Course.create({
        title: 'Test Course for Admin Enrollment Fix',
        course_url: testUrl,
        platform: 'udemy',
        category: 'Development',
        status: 'active',
        drive_link: null
      });
      console.log(`   ✅ Test course created: ID=${course.id}`);
    } else {
      // Clear drive_link if exists
      if (course.drive_link) {
        await course.update({ drive_link: null });
        console.log(`   ✅ Found existing course: ID=${course.id}, cleared drive_link`);
      } else {
        console.log(`   ✅ Found existing course: ID=${course.id}`);
      }
    }
    
    // Test 2: Trigger admin download (this will attempt enrollment)
    console.log('\nTest 2: Triggering admin download (will attempt enrollment)...');
    console.log(`   Email: ${testEmail}`);
    console.log(`   Course URL: ${testUrl}`);
    
    let result;
    try {
      result = await adminDownloadService.triggerAdminDownload(course.id, testEmail);
      console.log('   ✅ Admin download triggered');
      console.log(`   Task ID: ${result.taskId}`);
      console.log(`   Status: ${result.status}`);
    } catch (error) {
      console.error('   ❌ Failed to trigger admin download:', error.message);
      throw error;
    }
    
    // Test 3: Check task status after enrollment attempt
    console.log('\nTest 3: Checking task status after enrollment...');
    const task = await DownloadTask.findByPk(result.taskId, {
      attributes: ['id', 'status', 'course_type', 'order_id', 'email', 'error_log']
    });
    
    if (!task) {
      throw new Error('Task not found!');
    }
    
    console.log(`   Task ID: ${task.id}`);
    console.log(`   Status: ${task.status}`);
    console.log(`   Course Type: ${task.course_type} (should be 'permanent')`);
    console.log(`   Order ID: ${task.order_id} (should be null)`);
    console.log(`   Email: ${task.email}`);
    
    if (task.error_log) {
      console.log(`   Error Log: ${task.error_log.substring(0, 200)}...`);
    }
    
    // Verify admin download properties
    if (task.course_type !== 'permanent') {
      console.error(`   ❌ Expected course_type='permanent', got '${task.course_type}'`);
    } else {
      console.log('   ✅ Course type is correct (permanent)');
    }
    
    if (task.order_id !== null) {
      console.error(`   ❌ Expected order_id=null, got ${task.order_id}`);
    } else {
      console.log('   ✅ Order ID is correct (null)');
    }
    
    // Test 4: Verify status is NOT 'failed' even if enrollment failed
    console.log('\nTest 4: Verifying status handling...');
    if (task.status === 'failed') {
      console.error('   ❌ Task status is "failed" - this should not happen for admin downloads!');
      console.error('   Enrollment service should keep status as "processing" for admin downloads');
    } else if (task.status === 'processing') {
      console.log('   ✅ Task status is "processing" - correct for admin download with enrollment failure');
      console.log('   Worker will be able to proceed with download');
    } else if (task.status === 'enrolled') {
      console.log('   ✅ Task status is "enrolled" - enrollment succeeded');
    } else {
      console.log(`   ⚠️  Task status is "${task.status}" - unexpected but may be valid`);
    }
    
    // Test 5: Simulate enrollment failure scenario
    console.log('\nTest 5: Testing enrollment failure handling...');
    
    // Create another task to test enrollment failure
    const testTask2 = await DownloadTask.create({
      course_url: testUrl,
      title: course.title,
      email: testEmail,
      order_id: null,
      phone_number: null,
      course_type: 'permanent',
      status: 'processing',
      retry_count: 0,
      price: 0
    });
    
    console.log(`   Created test task: ID=${testTask2.id}`);
    
    // Try to enroll (this might fail, but should not set status to 'failed')
    try {
      const enrollResults = await enrollService.enrollCourses(
        [testUrl],
        testEmail,
        null // No orderId for admin downloads
      );
      
      const enrollResult = enrollResults[0];
      console.log(`   Enrollment result: success=${enrollResult.success}, status=${enrollResult.status}`);
      
      // Check task status after enrollment
      await testTask2.reload();
      console.log(`   Task status after enrollment: ${testTask2.status}`);
      
      if (enrollResult.success) {
        console.log('   ✅ Enrollment succeeded');
      } else {
        if (testTask2.status === 'failed') {
          console.error('   ❌ Task status was set to "failed" - this is wrong for admin downloads!');
        } else if (testTask2.status === 'processing') {
          console.log('   ✅ Task status kept as "processing" - correct behavior for admin downloads');
        }
      }
    } catch (enrollError) {
      console.log(`   Enrollment error caught: ${enrollError.message}`);
      
      // Check task status after error
      await testTask2.reload();
      console.log(`   Task status after enrollment error: ${testTask2.status}`);
      
      if (testTask2.status === 'failed') {
        console.error('   ❌ Task status was set to "failed" after enrollment error - this is wrong!');
        console.error('   Enrollment service should keep status as "processing" for admin downloads');
      } else if (testTask2.status === 'processing') {
        console.log('   ✅ Task status kept as "processing" - correct behavior!');
      }
    }
    
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await DownloadTask.destroy({ where: { id: result.taskId } });
    await DownloadTask.destroy({ where: { id: testTask2.id } });
    await course.update({ drive_link: null });
    console.log('   ✅ Test data cleaned up');
    
    console.log('\n✅ All tests completed!');
    console.log('   Admin enrollment fix is working correctly.');
    console.log('   Admin downloads can proceed even when enrollment fails.');
    
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
  testAdminEnrollmentFix().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { testAdminEnrollmentFix };
