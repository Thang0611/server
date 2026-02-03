/**
 * Script to analyze a specific order in the database
 * Usage: node scripts/analyze-order.js <orderId>
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Order, DownloadTask, OrderAuditLog, TaskLog, sequelize } = require('../src/models');
const { Op } = require('sequelize');

async function analyzeOrder(orderId) {
  try {
    console.log(`\n🔍 Analyzing Order ID: ${orderId}\n`);
    console.log('='.repeat(80));

    // Get order with all related data
    const order = await Order.findByPk(orderId, {
      include: [
        {
          model: DownloadTask,
          as: 'tasks',
          required: false
        },
        {
          model: OrderAuditLog,
          as: 'auditLogs',
          required: false,
          order: [['created_at', 'DESC']],
          limit: 50
        }
      ]
    });

    if (!order) {
      console.log(`❌ Order ID ${orderId} not found in database`);
      return;
    }

    // Order Basic Info
    console.log('\n📦 ORDER INFORMATION');
    console.log('-'.repeat(80));
    console.log(`ID: ${order.id}`);
    console.log(`Order Code: ${order.order_code}`);
    console.log(`User Email: ${order.user_email}`);
    console.log(`Total Amount: ${order.total_amount}`);
    console.log(`Payment Status: ${order.payment_status}`);
    console.log(`Order Status: ${order.order_status}`);
    console.log(`Created At: ${order.created_at}`);
    console.log(`Updated At: ${order.updated_at}`);

    // Tasks Information
    const tasks = order.tasks || [];
    console.log(`\n📋 TASKS (${tasks.length} total)`);
    console.log('-'.repeat(80));

    if (tasks.length === 0) {
      console.log('⚠️  No tasks found for this order');
    } else {
      // Group tasks by status
      const tasksByStatus = {};
      tasks.forEach(task => {
        if (!tasksByStatus[task.status]) {
          tasksByStatus[task.status] = [];
        }
        tasksByStatus[task.status].push(task);
      });

      console.log('\n📊 Tasks by Status:');
      Object.keys(tasksByStatus).forEach(status => {
        console.log(`  ${status}: ${tasksByStatus[status].length} task(s)`);
      });

      console.log('\n📝 Task Details:');
      tasks.forEach((task, index) => {
        console.log(`\n  Task #${index + 1} (ID: ${task.id})`);
        console.log(`    Status: ${task.status}`);
        console.log(`    Title: ${task.title || 'N/A'}`);
        console.log(`    Course URL: ${task.course_url}`);
        console.log(`    Email: ${task.email}`);
        console.log(`    Drive Link: ${task.drive_link || 'N/A'}`);
        console.log(`    Retry Count: ${task.retry_count}`);
        console.log(`    Created At: ${task.created_at}`);
        console.log(`    Updated At: ${task.updated_at}`);
        if (task.error_log) {
          console.log(`    Error Log: ${task.error_log.substring(0, 200)}${task.error_log.length > 200 ? '...' : ''}`);
        }
      });
    }

    // Audit Logs
    const auditLogs = order.auditLogs || [];
    console.log(`\n📜 AUDIT LOGS (${auditLogs.length} recent)`);
    console.log('-'.repeat(80));

    if (auditLogs.length === 0) {
      console.log('⚠️  No audit logs found');
    } else {
      auditLogs.slice(0, 20).forEach((log, index) => {
        console.log(`\n  Log #${index + 1}`);
        console.log(`    Event Type: ${log.event_type}`);
        console.log(`    Event Category: ${log.event_category}`);
        console.log(`    Severity: ${log.severity}`);
        console.log(`    Message: ${log.message}`);
        console.log(`    Task ID: ${log.task_id || 'N/A'}`);
        console.log(`    Created At: ${log.created_at}`);
        if (log.details) {
          try {
            const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
            console.log(`    Details: ${JSON.stringify(details, null, 2).substring(0, 200)}`);
          } catch (e) {
            console.log(`    Details: ${log.details}`);
          }
        }
      });
    }

    // Task Logs (from TaskLog table)
    const taskLogs = await TaskLog.findAll({
      where: { order_id: orderId },
      order: [['created_at', 'DESC']],
      limit: 20
    });

    console.log(`\n📄 TASK LOGS (${taskLogs.length} recent)`);
    console.log('-'.repeat(80));

    if (taskLogs.length === 0) {
      console.log('⚠️  No task logs found');
    } else {
      taskLogs.forEach((log, index) => {
        console.log(`\n  Log #${index + 1}`);
        console.log(`    Task ID: ${log.task_id || 'N/A'}`);
        console.log(`    Level: ${log.level}`);
        console.log(`    Category: ${log.category}`);
        console.log(`    Message: ${log.message}`);
        console.log(`    Created At: ${log.created_at}`);
      });
    }

    // Summary Analysis
    console.log(`\n📊 SUMMARY ANALYSIS`);
    console.log('-'.repeat(80));

    const statusCounts = {};
    tasks.forEach(task => {
      statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;
    });

    console.log('\nTask Status Distribution:');
    Object.keys(statusCounts).forEach(status => {
      const count = statusCounts[status];
      const percentage = ((count / tasks.length) * 100).toFixed(1);
      console.log(`  ${status}: ${count} (${percentage}%)`);
    });

    // Check for stuck tasks
    const stuckStatuses = ['processing', 'enrolled', 'pending'];
    const stuckTasks = tasks.filter(t => stuckStatuses.includes(t.status));
    if (stuckTasks.length > 0) {
      console.log(`\n⚠️  POTENTIALLY STUCK TASKS: ${stuckTasks.length}`);
      stuckTasks.forEach(task => {
        const hoursSinceUpdate = (Date.now() - new Date(task.updated_at)) / (1000 * 60 * 60);
        console.log(`  Task ${task.id} (${task.status}): Updated ${hoursSinceUpdate.toFixed(1)} hours ago`);
      });
    }

    // Check for failed tasks
    const failedTasks = tasks.filter(t => t.status === 'failed');
    if (failedTasks.length > 0) {
      console.log(`\n❌ FAILED TASKS: ${failedTasks.length}`);
      failedTasks.forEach(task => {
        console.log(`  Task ${task.id}: ${task.error_log ? task.error_log.substring(0, 100) : 'No error log'}`);
      });
    }

    // Check completion
    const completedTasks = tasks.filter(t => t.status === 'completed');
    const allCompleted = tasks.length > 0 && completedTasks.length === tasks.length;
    console.log(`\n✅ Completion Status: ${completedTasks.length}/${tasks.length} completed`);
    if (allCompleted) {
      console.log('  ✓ All tasks completed!');
    } else {
      console.log('  ⚠️  Some tasks still in progress or failed');
    }

    console.log('\n' + '='.repeat(80));
    console.log('Analysis complete!\n');

  } catch (error) {
    console.error('❌ Error analyzing order:', error);
    throw error;
  }
}

// Main execution
const orderId = process.argv[2];

if (!orderId) {
  console.error('Usage: node scripts/analyze-order.js <orderId>');
  console.error('Example: node scripts/analyze-order.js 46');
  process.exit(1);
}

analyzeOrder(parseInt(orderId, 10))
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
