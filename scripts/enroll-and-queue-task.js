/**
 * Script to enroll task and push to Redis queue
 * Usage: node scripts/enroll-and-queue-task.js <taskId>
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Order, DownloadTask } = require('../src/models');
const enrollService = require('../src/services/enroll.service');
const { addDownloadJob } = require('../src/queues/download.queue');
const Logger = require('../src/utils/logger.util');

async function enrollAndQueueTask(taskId) {
  try {
    console.log(`🚀 Starting enrollment and queue for task ${taskId}\n`);
    
    // Get task
    const task = await DownloadTask.findByPk(taskId, {
      include: [{ model: Order, as: 'order' }]
    });
    
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    console.log(`📋 Task Info:`);
    console.log(`   ID: ${task.id}`);
    console.log(`   Email: ${task.email}`);
    console.log(`   Course URL: ${task.course_url}`);
    console.log(`   Status: ${task.status}`);
    console.log(`   Order ID: ${task.order_id}`);
    console.log(`   Order Status: ${task.order?.payment_status || 'N/A'}\n`);
    
    // Check if order is paid
    if (task.order && task.order.payment_status !== 'paid') {
      throw new Error(`Order ${task.order_id} is not paid. Payment status: ${task.order.payment_status}`);
    }
    
    // Step 1: Enroll course
    console.log('📚 Step 1: Enrolling course...');
    const enrollResults = await enrollService.enrollCourses(
      [task.course_url],
      task.email,
      task.order_id
    );
    
    const enrollResult = enrollResults[0];
    if (!enrollResult || !enrollResult.success) {
      throw new Error(`Enrollment failed: ${enrollResult?.message || 'Unknown error'}`);
    }
    
    console.log(`✅ Course enrolled successfully!`);
    console.log(`   Course ID: ${enrollResult.courseId}`);
    console.log(`   Title: ${enrollResult.title}`);
    console.log(`   Status: ${enrollResult.status}\n`);
    
    // Refresh task to get updated status
    await task.reload();
    console.log(`📋 Task status after enrollment: ${task.status}\n`);
    
    // Step 2: Push to Redis queue
    if (task.status === 'enrolled') {
      console.log('📤 Step 2: Pushing task to Redis queue...');
      await addDownloadJob({
        taskId: task.id,
        email: task.email,
        courseUrl: task.course_url
      });
      
      console.log(`✅ Task ${taskId} pushed to Redis queue successfully!\n`);
    } else {
      console.log(`⚠️  Task status is '${task.status}', not 'enrolled'. Skipping queue push.`);
      console.log(`   Please check enrollment result.\n`);
    }
    
    console.log('✅ Process completed successfully!');
    console.log(`\n📊 Next steps:`);
    console.log(`   1. Check worker logs: pm2 logs workers`);
    console.log(`   2. Check worker-out.log: tail -f logs/worker-out.log`);
    console.log(`   3. Monitor Redis queue: redis-cli LLEN rq:queue:downloads`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

const taskId = process.argv[2] ? parseInt(process.argv[2]) : null;
if (!taskId) {
  console.error('❌ Usage: node scripts/enroll-and-queue-task.js <taskId>');
  process.exit(1);
}

enrollAndQueueTask(taskId);
