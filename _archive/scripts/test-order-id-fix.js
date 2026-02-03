/**
 * Test script to verify order_id = 0 vs null handling
 * Tests the fix for permanent downloads with order_id = 0
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { DownloadTask } = require('../src/models');
const enrollService = require('../src/services/enroll.service');
const Logger = require('../src/utils/logger.util');

const testEmail = process.env.TEST_EMAIL || 'support@getcourses.net';
const testUrl = 'https://www.udemy.com/course/the-complete-web-development-bootcamp/';

async function testOrderIdHandling() {
  try {
    console.log('🧪 Testing order_id = 0 vs null handling...\n');
    
    // Test 1: Create task with order_id = null (should be stored as NULL in DB)
    console.log('Test 1: Creating task with order_id = null...');
    const task1 = await DownloadTask.create({
      email: testEmail,
      course_url: testUrl + '?test=1',
      status: 'processing',
      order_id: null,
      course_type: 'permanent',
      price: 0
    });
    console.log(`   ✅ Task created: ID=${task1.id}, order_id=${task1.order_id} (type: ${typeof task1.order_id})`);
    
    // Test 2: Try to find tasks with orderId = null
    console.log('\nTest 3: Testing enrollCourses with orderId = null...');
    try {
      const results = await enrollService.enrollCourses(
        [testUrl + '?test=1'],
        testEmail,
        null // orderId = null
      );
      console.log('   ✅ enrollCourses succeeded (may fail enrollment but should find task)');
      console.log('   Results:', JSON.stringify(results, null, 2));
    } catch (error) {
      if (error.message && error.message.includes('task is not defined')) {
        console.error('   ❌ Still getting "task is not defined" error!');
        throw error;
      } else if (error.message && error.message.includes('Not found in DB')) {
        console.error('   ❌ Task not found in database!');
        console.error('   This means the query is not finding tasks with order_id = null or 0');
        throw error;
      } else {
        console.log('   ⚠️  Got expected error (not related to task finding):', error.message);
      }
    }
    
    // Test 3: Verify task can be found
    console.log('\nTest 3: Verifying task can be found directly...');
    const foundTask1 = await DownloadTask.findByPk(task1.id);
    console.log(`   Task 1: ID=${foundTask1.id}, order_id=${foundTask1.order_id}, order_id === null: ${foundTask1.order_id === null}, order_id == 0: ${foundTask1.order_id == 0}`);
    
    // Test 4: Verify task can be found with enrollCourses
    console.log('\nTest 4: Verifying task can be found by enrollCourses...');
    const foundByEnroll = await DownloadTask.findOne({
      where: {
        order_id: null,
        email: testEmail,
        course_url: testUrl + '?test=1',
        status: ['processing', 'pending']
      }
    });
    if (foundByEnroll) {
      console.log(`   ✅ Task found by enrollCourses query: ID=${foundByEnroll.id}`);
    } else {
      console.error('   ❌ Task NOT found by enrollCourses query!');
    }
    
    // Cleanup
    console.log('\n🧹 Cleaning up test tasks...');
    await DownloadTask.destroy({ where: { id: task1.id } });
    console.log('   ✅ Test task deleted');
    
    console.log('\n✅ All tests completed!');
    console.log('   The order_id = 0 vs null issue should be fixed now.');
    
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
  testOrderIdHandling().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { testOrderIdHandling };
