/**
 * Test script for enroll service error handling
 * Tests the fix for "task is not defined" error
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { DownloadTask } = require('../src/models');
const enrollService = require('../src/services/enroll.service');
const Logger = require('../src/utils/logger.util');

// Test data
const testEmail = process.env.TEST_EMAIL || 'support@getcourses.net';
const testUrl = 'https://www.udemy.com/course/the-complete-web-development-bootcamp/';

async function testEnrollService() {
  try {
    console.log('🧪 Testing enroll service error handling...\n');
    
    // Test 1: Test with null task scenario (simulating error before task lookup)
    console.log('Test 1: Testing error handling when task is null...');
    try {
      // This should not throw "task is not defined" error
      const results = await enrollService.enrollCourses(
        [testUrl],
        testEmail,
        null // No orderId
      );
      console.log('✅ Test 1 passed: No "task is not defined" error');
      console.log('   Results:', JSON.stringify(results, null, 2));
    } catch (error) {
      if (error.message && error.message.includes('task is not defined')) {
        console.error('❌ Test 1 failed: Still getting "task is not defined" error');
        console.error('   Error:', error.message);
        throw error;
      } else {
        console.log('⚠️  Test 1: Got expected error (not "task is not defined"):', error.message);
      }
    }
    
    // Test 2: Test with existing task
    console.log('\nTest 2: Testing with existing task in database...');
    try {
      // Find or create a test task
      let task = await DownloadTask.findOne({
        where: {
          email: testEmail,
          course_url: testUrl,
          status: ['processing', 'pending']
        },
        order: [['id', 'DESC']]
      });
      
      if (!task) {
        console.log('   Creating test task...');
        task = await DownloadTask.create({
          email: testEmail,
          course_url: testUrl,
          status: 'processing',
          order_id: null,
          course_type: 'permanent',
          price: 0
        });
        console.log('   ✅ Test task created:', task.id);
      } else {
        console.log('   ✅ Found existing task:', task.id);
      }
      
      // Test enrollment (this might fail due to cookie/auth, but should not throw "task is not defined")
      const results = await enrollService.enrollCourses(
        [testUrl],
        testEmail,
        null
      );
      
      console.log('✅ Test 2 passed: No "task is not defined" error');
      console.log('   Results:', JSON.stringify(results, null, 2));
    } catch (error) {
      if (error.message && error.message.includes('task is not defined')) {
        console.error('❌ Test 2 failed: Still getting "task is not defined" error');
        console.error('   Error:', error.message);
        throw error;
      } else {
        console.log('⚠️  Test 2: Got expected error (not "task is not defined"):', error.message);
        console.log('   This is OK - enrollment might fail due to cookie/auth issues');
      }
    }
    
    console.log('\n✅ All tests completed!');
    console.log('   The "task is not defined" error should be fixed now.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  } finally {
    // Close database connection
    if (DownloadTask.sequelize) {
      await DownloadTask.sequelize.close();
    }
  }
}

// Run the test
if (require.main === module) {
  testEnrollService().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { testEnrollService };
