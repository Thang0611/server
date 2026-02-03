/**
 * Script to fix Order 46
 * - Update order_status to 'completed' if all tasks are completed
 * - Fix task status if drive_link is null but status is completed
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Order, DownloadTask, sequelize } = require('../src/models');
const { IN_PROGRESS_STATUSES } = require('../src/constants/taskStatus');

async function fixOrder46() {
  const transaction = await sequelize.transaction();
  
  try {
    console.log('\n🔧 Fixing Order 46...\n');

    // Get order with tasks
    const order = await Order.findByPk(46, {
      include: [{
        model: DownloadTask,
        as: 'tasks',
        required: false
      }],
      transaction
    });

    if (!order) {
      console.log('❌ Order 46 not found');
      return;
    }

    console.log(`Order: ${order.order_code}`);
    console.log(`Current order_status: ${order.order_status}`);
    console.log(`Payment status: ${order.payment_status}`);
    console.log(`Tasks: ${order.tasks.length}`);

    // Check tasks
    const tasks = order.tasks || [];
    
    if (tasks.length === 0) {
      console.log('⚠️  No tasks found');
      await transaction.rollback();
      return;
    }

    // Fix task status if completed but no drive_link
    let fixedTasks = 0;
    for (const task of tasks) {
      if (task.status === 'completed' && !task.drive_link) {
        console.log(`\n⚠️  Task ${task.id}: Status is 'completed' but drive_link is null`);
        console.log(`   Fixing: Setting status to 'failed'`);
        
        await task.update({
          status: 'failed',
          error_log: 'Task marked as completed but no drive_link found. This may indicate the download completed but the drive folder was not found or the webhook was not called properly.'
        }, { transaction });
        
        fixedTasks++;
      }
    }

    // Check if all tasks are completed or failed (no in-progress tasks)
    const inProgressTasks = tasks.filter(t => 
      IN_PROGRESS_STATUSES.includes(t.status)
    );

    const completedTasks = tasks.filter(t => t.status === 'completed' && t.drive_link);
    const failedTasks = tasks.filter(t => t.status === 'failed');
    const allDone = inProgressTasks.length === 0;

    console.log(`\n📊 Task Summary:`);
    console.log(`   Total: ${tasks.length}`);
    console.log(`   Completed (with drive_link): ${completedTasks.length}`);
    console.log(`   Failed: ${failedTasks.length}`);
    console.log(`   In Progress: ${inProgressTasks.length}`);
    console.log(`   All Done: ${allDone}`);

    // Update order status if all tasks are done
    if (allDone && order.order_status !== 'completed') {
      console.log(`\n✅ All tasks are done. Updating order_status to 'completed'`);
      
      await order.update({
        order_status: 'completed'
      }, { transaction });

      console.log(`   Order status updated: ${order.order_status} → completed`);
    } else if (!allDone) {
      console.log(`\n⚠️  Still have tasks in progress. Order status remains: ${order.order_status}`);
    } else {
      console.log(`\n✓ Order status is already correct: ${order.order_status}`);
    }

    // Commit transaction
    await transaction.commit();

    console.log(`\n✅ Fix complete!`);
    console.log(`   Fixed ${fixedTasks} task(s)`);
    console.log(`   Order status: ${order.order_status}\n`);

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error fixing order:', error);
    throw error;
  }
}

fixOrder46()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
