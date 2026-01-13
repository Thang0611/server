/**
 * Script to requeue stuck orders manually
 * Usage: node scripts/requeue-stuck-orders.js
 */

require('dotenv').config();
const { DownloadTask } = require('../src/models');
const { addDownloadJob } = require('../src/queues/download.queue');

async function requeueStuckOrders() {
  try {
    console.log('🔍 Finding stuck tasks (status=processing but not in queue)...\n');

    // Find tasks with status 'processing'
    const tasks = await DownloadTask.findAll({
      where: { status: 'processing' },
      attributes: ['id', 'email', 'course_url', 'order_id'],
      order: [['created_at', 'ASC']]
    });

    console.log(`Found ${tasks.length} task(s) in processing status\n`);

    if (tasks.length === 0) {
      console.log('✅ No stuck tasks found');
      process.exit(0);
    }

    let successCount = 0;
    let failCount = 0;

    for (const task of tasks) {
      try {
        console.log(`⏳ Queueing task ${task.id} (order ${task.order_id})...`);
        
        await addDownloadJob({
          taskId: task.id,
          email: task.email,
          courseUrl: task.course_url
        });

        successCount++;
        console.log(`✅ Task ${task.id} queued successfully\n`);
      } catch (error) {
        failCount++;
        console.error(`❌ Failed to queue task ${task.id}:`, error.message, '\n');
      }
    }

    console.log('\n📊 Summary:');
    console.log(`Total: ${tasks.length}`);
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);

    process.exit(failCount > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

requeueStuckOrders();
