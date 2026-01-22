/**
 * Test script to verify webhook fix
 * Tests that task cannot be completed without drive_link
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { DownloadTask } = require('../src/models');
const { TASK_STATUS } = require('../src/constants/taskStatus');

async function testWebhookFix() {
  try {
    console.log('\n🧪 Testing Webhook Fix\n');
    console.log('='.repeat(80));

    // Test 1: Check if any tasks are completed without drive_link
    console.log('\n📋 Test 1: Checking for tasks completed without drive_link...');
    const invalidTasks = await DownloadTask.findAll({
      where: {
        status: TASK_STATUS.COMPLETED,
        drive_link: null
      },
      attributes: ['id', 'status', 'drive_link', 'course_url', 'order_id']
    });

    if (invalidTasks.length > 0) {
      console.log(`❌ Found ${invalidTasks.length} task(s) with status 'completed' but no drive_link:`);
      invalidTasks.forEach(task => {
        console.log(`   Task ${task.id}: status=${task.status}, drive_link=${task.drive_link}`);
      });
      console.log('\n⚠️  This indicates the bug still exists!');
    } else {
      console.log('✅ No tasks found with status "completed" and no drive_link');
      console.log('   This is correct - tasks should only be completed when they have drive_link');
    }

    // Test 2: Check task 68 (should have drive_link if completed)
    console.log('\n📋 Test 2: Checking Task 68...');
    const task68 = await DownloadTask.findByPk(68);
    if (task68) {
      console.log(`   Task 68 Status: ${task68.status}`);
      console.log(`   Task 68 Drive Link: ${task68.drive_link || 'NULL'}`);
      
      if (task68.status === TASK_STATUS.COMPLETED && !task68.drive_link) {
        console.log('   ❌ Task 68 is completed but has no drive_link - BUG EXISTS!');
      } else if (task68.status === TASK_STATUS.COMPLETED && task68.drive_link) {
        console.log('   ✅ Task 68 is completed with drive_link - CORRECT!');
      } else {
        console.log(`   ℹ️  Task 68 status is: ${task68.status}`);
      }
    } else {
      console.log('   ⚠️  Task 68 not found');
    }

    // Test 3: Check recent completed tasks
    console.log('\n📋 Test 3: Checking recent completed tasks...');
    const recentCompleted = await DownloadTask.findAll({
      where: {
        status: TASK_STATUS.COMPLETED
      },
      order: [['updated_at', 'DESC']],
      limit: 10,
      attributes: ['id', 'status', 'drive_link', 'updated_at']
    });

    console.log(`   Found ${recentCompleted.length} recent completed tasks:`);
    let allValid = true;
    recentCompleted.forEach(task => {
      const hasDriveLink = !!task.drive_link;
      const icon = hasDriveLink ? '✅' : '❌';
      console.log(`   ${icon} Task ${task.id}: drive_link=${hasDriveLink ? 'YES' : 'NULL'}, updated=${task.updated_at}`);
      if (!hasDriveLink) {
        allValid = false;
      }
    });

    if (allValid) {
      console.log('\n   ✅ All recent completed tasks have drive_link - CORRECT!');
    } else {
      console.log('\n   ❌ Some completed tasks are missing drive_link - BUG EXISTS!');
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 Test Summary:');
    console.log(`   Invalid tasks (completed without drive_link): ${invalidTasks.length}`);
    console.log(`   Recent completed tasks checked: ${recentCompleted.length}`);
    console.log(`   All valid: ${allValid && invalidTasks.length === 0 ? '✅ YES' : '❌ NO'}`);
    
    if (invalidTasks.length === 0 && allValid) {
      console.log('\n✅ All tests passed! The fix is working correctly.');
      console.log('   Tasks can only be completed when they have a drive_link.');
    } else {
      console.log('\n⚠️  Some issues found. Please review the results above.');
    }

    console.log('\n');

  } catch (error) {
    console.error('❌ Test error:', error);
    throw error;
  }
}

testWebhookFix()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
