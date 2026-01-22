/**
 * Fix all tasks that are completed but have no drive_link
 * These are tasks from before the fix was applied
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { DownloadTask } = require('../src/models');
const { TASK_STATUS } = require('../src/constants/taskStatus');

async function fixInvalidCompletedTasks() {
  try {
    console.log('\n🔧 Fixing invalid completed tasks...\n');

    // Find all tasks that are completed but have no drive_link
    const invalidTasks = await DownloadTask.findAll({
      where: {
        status: TASK_STATUS.COMPLETED,
        drive_link: null
      }
    });

    if (invalidTasks.length === 0) {
      console.log('✅ No invalid tasks found. All completed tasks have drive_link.');
      return;
    }

    console.log(`Found ${invalidTasks.length} task(s) with status 'completed' but no drive_link:\n`);

    for (const task of invalidTasks) {
      console.log(`  Task ${task.id}:`);
      console.log(`    Course: ${task.course_url}`);
      console.log(`    Order ID: ${task.order_id}`);
      console.log(`    Current status: ${task.status}`);
      console.log(`    Drive link: ${task.drive_link || 'NULL'}`);
      
      // Fix: Set status to 'failed' with explanation
      await task.update({
        status: TASK_STATUS.FAILED,
        error_log: 'Task was marked as completed but has no drive_link. This indicates the webhook was not called successfully or the drive folder was not found. This task was fixed automatically.'
      });

      console.log(`    ✅ Fixed: Status changed to 'failed'`);
      console.log('');
    }

    console.log(`\n✅ Fixed ${invalidTasks.length} task(s)\n`);

  } catch (error) {
    console.error('❌ Error fixing tasks:', error);
    throw error;
  }
}

fixInvalidCompletedTasks()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
