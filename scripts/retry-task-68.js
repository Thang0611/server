/**
 * Script to retry download for task 68
 * This will re-enroll and queue the task for download
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { DownloadTask, Order } = require('../src/models');
const { addDownloadJob } = require('../src/queues/download.queue');
const { enrollCourses } = require('../src/services/enroll.service');
const { TASK_STATUS } = require('../src/constants/taskStatus');
const Logger = require('../src/utils/logger.util');

async function retryTask68() {
  try {
    console.log('\n🔄 Retrying Task 68...\n');

    // Get task
    const task = await DownloadTask.findByPk(68, {
      include: [{
        model: Order,
        as: 'order',
        required: false
      }]
    });

    if (!task) {
      console.log('❌ Task 68 not found');
      return;
    }

    console.log(`Task ID: ${task.id}`);
    console.log(`Current Status: ${task.status}`);
    console.log(`Course URL: ${task.course_url}`);
    console.log(`Email: ${task.email}`);
    console.log(`Order ID: ${task.order_id}`);
    console.log(`Order Code: ${task.order?.order_code || 'N/A'}`);

    // Reset task to processing
    console.log('\n📝 Resetting task status to processing...');
    await task.update({
      status: TASK_STATUS.PROCESSING,
      error_log: null
    });
    console.log('✓ Task status reset to processing');

    // Re-enroll
    console.log('\n📚 Re-enrolling course...');
    const enrollResults = await enrollCourses(
      [task.course_url],
      task.email,
      task.order_id
    );

    const enrollResult = enrollResults[0];
    if (enrollResult && enrollResult.success && enrollResult.status === 'enrolled') {
      console.log('✓ Course enrolled successfully');
      
      // Verify status
      const updatedTask = await DownloadTask.findByPk(task.id);
      if (updatedTask.status === TASK_STATUS.ENROLLED) {
        console.log('✓ Task status verified: enrolled');
      } else {
        console.log(`⚠️  Task status is: ${updatedTask.status} (expected: enrolled)`);
      }

      // Queue for download
      console.log('\n📥 Queuing task for download...');
      await addDownloadJob({
        taskId: task.id,
        email: task.email,
        courseUrl: task.course_url
      });
      console.log('✓ Task queued for download');

      console.log('\n✅ Retry complete! Task will be processed by worker.\n');
    } else {
      console.log('❌ Enrollment failed:', enrollResult);
      throw new Error('Enrollment failed');
    }

  } catch (error) {
    console.error('❌ Error retrying task:', error);
    throw error;
  }
}

retryTask68()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
