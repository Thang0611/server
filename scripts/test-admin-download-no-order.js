/**
 * Test script to verify admin download does NOT create order
 * Tests that admin download flow is completely separate from order flow
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Course, DownloadTask, Order } = require('../src/models');
const adminDownloadService = require('../src/services/adminDownload.service');
const Logger = require('../src/utils/logger.util');

const testEmail = process.env.ADMIN_EMAIL || 'support@getcourses.net';

async function testAdminDownloadNoOrder() {
  try {
    console.log('🧪 Testing Admin Download - NO ORDER CREATION\n');
    console.log('='.repeat(70));
    
    // Step 1: Count orders before
    console.log('\n📊 Step 1: Counting orders before test...');
    const ordersBefore = await Order.count();
    console.log(`   Orders in database: ${ordersBefore}`);
    
    // Step 2: Find or create test course
    console.log('\n📝 Step 2: Preparing test course...');
    const testUrl = 'https://www.udemy.com/course/the-complete-web-development-bootcamp/';
    
    let course = await Course.findOne({
      where: { course_url: testUrl }
    });
    
    if (!course) {
      course = await Course.create({
        title: 'The Complete Web Development Bootcamp',
        course_url: testUrl,
        platform: 'udemy',
        category: 'Development',
        status: 'active',
        drive_link: null
      });
      console.log(`   ✅ Created test course: ID=${course.id}`);
    } else {
      if (course.drive_link) {
        await course.update({ drive_link: null });
      }
      console.log(`   ✅ Found course: ID=${course.id}`);
    }
    
    // Step 3: Trigger admin download
    console.log('\n🚀 Step 3: Triggering admin download...');
    console.log(`   Course ID: ${course.id}`);
    console.log(`   Email: ${testEmail}`);
    
    const downloadResult = await adminDownloadService.triggerAdminDownload(course.id, testEmail);
    console.log('   ✅ Download triggered');
    console.log(`   Task ID: ${downloadResult.taskId}`);
    
    // Step 4: Verify NO order was created
    console.log('\n🔍 Step 4: Verifying NO order was created...');
    const ordersAfter = await Order.count();
    console.log(`   Orders before: ${ordersBefore}`);
    console.log(`   Orders after: ${ordersAfter}`);
    
    if (ordersAfter === ordersBefore) {
      console.log('   ✅ SUCCESS: No order was created!');
    } else {
      console.error(`   ❌ FAILED: Order count increased from ${ordersBefore} to ${ordersAfter}`);
      throw new Error('Order was created when it should not be');
    }
    
    // Step 5: Verify task has order_id = null
    console.log('\n✅ Step 5: Verifying task properties...');
    const task = await DownloadTask.findByPk(downloadResult.taskId, {
      attributes: ['id', 'order_id', 'course_type', 'status', 'email']
    });
    
    console.log(`   Task ID: ${task.id}`);
    console.log(`   order_id: ${task.order_id} ${task.order_id === null ? '✅ (correct)' : '❌ (should be null)'}`);
    console.log(`   course_type: ${task.course_type} ${task.course_type === 'permanent' ? '✅' : '❌'}`);
    console.log(`   status: ${task.status}`);
    console.log(`   email: ${task.email}`);
    
    if (task.order_id !== null) {
      throw new Error(`Task has order_id = ${task.order_id}, should be null`);
    }
    
    if (task.course_type !== 'permanent') {
      throw new Error(`Task has course_type = ${task.course_type}, should be 'permanent'`);
    }
    
    // Step 6: Verify no order was created in the last minute
    console.log('\n🔍 Step 6: Checking for recent orders...');
    const recentOrders = await Order.findAll({
      where: {
        created_at: {
          [require('sequelize').Op.gte]: new Date(Date.now() - 60000) // Last minute
        }
      },
      attributes: ['id', 'order_code', 'user_email', 'created_at']
    });
    
    if (recentOrders.length > 0) {
      console.error(`   ❌ Found ${recentOrders.length} recent order(s):`);
      recentOrders.forEach(order => {
        console.error(`      Order ${order.order_code} (ID: ${order.id}) created at ${order.created_at}`);
      });
      throw new Error('Recent orders found - order was created!');
    } else {
      console.log('   ✅ No recent orders found');
    }
    
    // Cleanup
    console.log('\n🧹 Step 7: Cleaning up...');
    await DownloadTask.destroy({ where: { id: downloadResult.taskId } });
    await course.update({ drive_link: null });
    console.log('   ✅ Test data cleaned up');
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('✅ ALL TESTS PASSED!');
    console.log('='.repeat(70));
    console.log('\n📋 Summary:');
    console.log('   ✅ Admin download does NOT create order');
    console.log('   ✅ Task created with order_id = null');
    console.log('   ✅ Task created with course_type = permanent');
    console.log('   ✅ No order count increase');
    console.log('   ✅ No recent orders found');
    console.log('\n💡 Admin download flow is completely separate from order flow!');
    
  } catch (error) {
    console.error('\n' + '='.repeat(70));
    console.error('❌ TEST FAILED');
    console.error('='.repeat(70));
    console.error('\nError:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
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
  testAdminDownloadNoOrder().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { testAdminDownloadNoOrder };
