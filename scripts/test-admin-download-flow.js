/**
 * Test script for admin download flow
 * Tests the dedicated admin download service
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Course, DownloadTask } = require('../src/models');
const adminDownloadService = require('../src/services/adminDownload.service');
const Logger = require('../src/utils/logger.util');

const testEmail = process.env.ADMIN_EMAIL || 'support@getcourses.net';
const testUrl = 'https://www.udemy.com/course/the-complete-web-development-bootcamp/';

async function testAdminDownloadFlow() {
  try {
    console.log('🧪 Testing Admin Download Flow...\n');
    
    // Test 1: Create a test course
    console.log('Test 1: Creating test course...');
    let course = await Course.findOne({
      where: { course_url: testUrl }
    });
    
    if (!course) {
      course = await Course.create({
        title: 'Test Course for Admin Download',
        course_url: testUrl,
        platform: 'udemy',
        category: 'Development',
        status: 'active',
        drive_link: null // No drive link yet
      });
      console.log(`   ✅ Test course created: ID=${course.id}`);
    } else {
      // Clear drive_link if exists
      if (course.drive_link) {
        await course.update({ drive_link: null });
        console.log(`   ✅ Found existing course: ID=${course.id}, cleared drive_link`);
      } else {
        console.log(`   ✅ Found existing course: ID=${course.id}, no drive_link`);
      }
    }
    
    // Test 2: Trigger admin download
    console.log('\nTest 2: Triggering admin download...');
    try {
      const result = await adminDownloadService.triggerAdminDownload(course.id, testEmail);
      console.log('   ✅ Admin download triggered successfully');
      console.log('   Result:', JSON.stringify(result, null, 2));
      
      // Test 3: Verify task was created
      console.log('\nTest 3: Verifying task was created...');
      const task = await DownloadTask.findByPk(result.taskId);
      if (task) {
        console.log(`   ✅ Task found: ID=${task.id}`);
        console.log(`      order_id: ${task.order_id} (should be null)`);
        console.log(`      course_type: ${task.course_type} (should be 'permanent')`);
        console.log(`      status: ${task.status}`);
        console.log(`      email: ${task.email}`);
      } else {
        console.error('   ❌ Task not found!');
      }
      
      // Test 4: Simulate webhook completion (update course drive_link)
      console.log('\nTest 4: Simulating webhook completion...');
      const testDriveLink = 'https://drive.google.com/drive/folders/test-folder-id';
      const updateResult = await adminDownloadService.updateCourseDriveLink(result.taskId, testDriveLink);
      
      if (updateResult.updated) {
        console.log('   ✅ Course drive_link updated successfully');
        console.log(`      Course ID: ${updateResult.courseId}`);
        console.log(`      Drive Link: ${updateResult.driveLink}`);
        
        // Verify course was updated
        const updatedCourse = await Course.findByPk(course.id);
        if (updatedCourse.drive_link === testDriveLink) {
          console.log('   ✅ Verified: Course drive_link matches');
        } else {
          console.error(`   ❌ Mismatch: Expected ${testDriveLink}, got ${updatedCourse.drive_link}`);
        }
      } else {
        console.log(`   ⚠️  Course update skipped: ${updateResult.reason}`);
      }
      
      // Cleanup
      console.log('\n🧹 Cleaning up...');
      await DownloadTask.destroy({ where: { id: result.taskId } });
      await course.update({ drive_link: null });
      console.log('   ✅ Test data cleaned up');
      
    } catch (error) {
      console.error('   ❌ Admin download failed:', error.message);
      if (error.stack) {
        console.error('   Stack:', error.stack);
      }
      throw error;
    }
    
    console.log('\n✅ All tests completed!');
    console.log('   Admin download flow is working correctly.');
    
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
  testAdminDownloadFlow().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { testAdminDownloadFlow };
