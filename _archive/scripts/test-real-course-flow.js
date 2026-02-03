/**
 * Test real course purchase flow with real URL and email
 * Usage: node scripts/test-real-course-flow.js [course_id] [email]
 * Example: node scripts/test-real-course-flow.js 1 user@example.com
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Order, DownloadTask, Course } = require('../src/models');
const paymentService = require('../src/services/payment.service');
const { checkExistingDownload } = require('../src/services/checkExistingDownload.service');
const Logger = require('../src/utils/logger.util');

// Get arguments
const courseId = process.argv[2] ? parseInt(process.argv[2]) : null;
const userEmail = process.argv[3] || process.env.TEST_EMAIL || 'test@example.com';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'cyan');
  console.log('='.repeat(70) + '\n');
}

function logStep(step, message) {
  log(`\n[Step ${step}] ${message}`, 'blue');
  console.log('-'.repeat(70));
}

async function testRealCourseFlow() {
  try {
    logSection('🧪 TEST REAL COURSE PURCHASE FLOW');
    
    // Step 1: Get course from database or URL
    logStep(1, 'Get course from database');
    let course;
    const courseUrl = process.argv[4]; // Allow URL as 4th argument
    
    if (courseUrl) {
      // Find by URL
      course = await Course.findOne({ 
        where: { course_url: courseUrl }
      });
      
      if (!course) {
        log(`⚠️  Course not found in database with URL: ${courseUrl}`, 'yellow');
        log(`   Creating temporary course entry for testing...`, 'yellow');
        
        // Create a temporary course entry for testing
        course = await Course.create({
          course_url: courseUrl,
          title: courseUrl.split('/').pop() || 'Test Course',
          category: null,
          platform: 'Udemy',
          price: 2000,
          status: 'active',
          course_type: 'permanent'
        });
        
        log(`✅ Created temporary course entry (ID: ${course.id})`, 'green');
      }
    } else if (courseId) {
      course = await Course.findByPk(courseId);
      if (!course) {
        log(`❌ Course with ID ${courseId} not found`, 'red');
        process.exit(1);
      }
    } else {
      // Get first active course
      course = await Course.findOne({ 
        where: { status: 'active' },
        order: [['id', 'ASC']]
      });
      
      if (!course) {
        log('❌ No active courses found in database', 'red');
        process.exit(1);
      }
    }
    
    log(`✅ Found course: ${course.title}`, 'green');
    log(`   ID: ${course.id}`);
    log(`   URL: ${course.course_url}`);
    log(`   Category: ${course.category || 'N/A'}`);
    log(`   Platform: ${course.platform || 'N/A'}`);
    
    // Step 2: Check if course already has drive_link
    logStep(2, 'Check existing download');
    const existingDownload = await checkExistingDownload(course.course_url, 'permanent');
    
    if (existingDownload && existingDownload.drive_link) {
      log(`✅ Course already downloaded!`, 'green');
      log(`   Drive Link: ${existingDownload.drive_link}`);
      log(`   Task ID: ${existingDownload.id}`);
      log(`   Status: ${existingDownload.status}`);
      log(`\n⚠️  This course already has a drive_link.`, 'yellow');
      log(`   If you proceed, it will grant access immediately without downloading.`, 'yellow');
    } else {
      log(`ℹ️  Course not yet downloaded`, 'yellow');
      log(`   Will proceed with download after payment`);
    }
    
    // Step 3: Create order
    logStep(3, 'Create order');
    const courses = [{
      url: course.course_url,
      title: course.title || 'Test Course',
      price: course.price || 2000,
      courseId: course.id,
      courseType: 'permanent',
      category: course.category || null
    }];
    
    log(`Creating order for:`);
    log(`   Email: ${userEmail}`);
    log(`   Course: ${courses[0].title}`);
    log(`   URL: ${courses[0].url}`);
    log(`   Price: ${courses[0].price} VND`);
    log(`   Type: ${courses[0].courseType}`);
    
    try {
      const orderResult = await paymentService.createOrder(userEmail, courses);
      
      log(`\n🔍 Debug: orderResult type: ${typeof orderResult}`, 'yellow');
      log(`   orderResult keys: ${orderResult ? Object.keys(orderResult).join(', ') : 'null'}`, 'yellow');
      
      // paymentService.createOrder returns { orderId, orderCode, ... }
      // We need to fetch the full order from database
      let order;
      if (orderResult && orderResult.orderId) {
        // Fetch order from database
        order = await Order.findByPk(orderResult.orderId);
        if (!order) {
          log(`❌ Order created but not found in database (ID: ${orderResult.orderId})`, 'red');
          process.exit(1);
        }
        log(`✅ Order created successfully!`, 'green');
      } else if (orderResult && orderResult.id) {
        // orderResult is the order object directly
        order = orderResult;
        log(`✅ Order created successfully!`, 'green');
      } else if (orderResult && orderResult.success && orderResult.order) {
        // orderResult is wrapped with success flag
        order = orderResult.order;
        log(`✅ Order created successfully!`, 'green');
      } else if (orderResult && orderResult.success === false) {
        const errorMsg = orderResult?.error || 'Unknown error';
        log(`❌ Failed to create order: ${errorMsg}`, 'red');
        if (orderResult?.details) {
          log(`   Details: ${JSON.stringify(orderResult.details)}`, 'red');
        }
        process.exit(1);
      } else {
        log(`❌ Unexpected order result format`, 'red');
        log(`   Result: ${JSON.stringify(orderResult, null, 2)}`, 'red');
        process.exit(1);
      }
      log(`✅ Order created successfully!`, 'green');
      log(`   Order ID: ${order.id}`);
      log(`   Order Code: ${order.order_code}`);
      log(`   Total Amount: ${order.total_amount} VND`);
      log(`   Payment Status: ${order.payment_status}`);
      
      // Check download tasks
      const tasks = await DownloadTask.findAll({
        where: { order_id: order.id }
      });
      
      log(`\n📋 Download Tasks created: ${tasks.length}`);
      tasks.forEach((task, idx) => {
        log(`   Task ${idx + 1}:`);
        log(`      ID: ${task.id}`);
        log(`      Course: ${task.title}`);
        log(`      URL: ${task.course_url}`);
        log(`      Type: ${task.course_type}`);
        log(`      Category: ${task.category || 'N/A'}`);
        log(`      Status: ${task.status}`);
      });
      
      // Step 4: Simulate payment webhook
      logStep(4, 'Simulate payment webhook');
      log(`Simulating payment confirmation...`);
      log(`   Order Code: ${order.order_code}`);
      log(`   Amount: ${order.total_amount} VND`);
      
      const webhookData = {
        gateway: 'test',
        transactionDate: new Date().toISOString(),
        referenceCode: `TEST-${Date.now()}`
      };
      
      const webhookResult = await paymentService.processPaymentWebhook(
        order.order_code,
        order.total_amount,
        webhookData
      );
      
      log(`\n🔍 Debug: webhookResult type: ${typeof webhookResult}`, 'yellow');
      log(`   webhookResult keys: ${webhookResult ? Object.keys(webhookResult).join(', ') : 'null'}`, 'yellow');
      
      // Refresh order after webhook
      const updatedOrder = await Order.findByPk(order.id);
      
      if (webhookResult && webhookResult.success === false) {
        log(`❌ Payment webhook failed: ${webhookResult.error}`, 'red');
        process.exit(1);
      }
      
      log(`✅ Payment webhook processed successfully!`, 'green');
      log(`   Order Status: ${updatedOrder.order_status}`);
      log(`   Payment Status: ${updatedOrder.payment_status}`);
      
      // Step 5: Check final status
      logStep(5, 'Check final status');
      
      // Refresh order
      const finalOrder = await Order.findByPk(order.id, {
        include: [{
          model: DownloadTask,
          as: 'tasks'
        }]
      });
      
      log(`\n📊 Final Order Status:`, 'magenta');
      log(`   Order ID: ${finalOrder.id}`);
      log(`   Order Code: ${finalOrder.order_code}`);
      log(`   Payment Status: ${finalOrder.payment_status}`);
      log(`   Order Status: ${finalOrder.order_status}`);
      
      log(`\n📋 Download Tasks Status:`, 'magenta');
      const finalTasks = await DownloadTask.findAll({
        where: { order_id: order.id },
        order: [['id', 'ASC']]
      });
      
      finalTasks.forEach((task, idx) => {
        log(`\n   Task ${idx + 1}: ${task.title}`);
        log(`      Status: ${task.status}`);
        log(`      Course Type: ${task.course_type}`);
        log(`      Drive Link: ${task.drive_link ? '✅ ' + task.drive_link : '❌ Not available yet'}`);
        
        if (task.status === 'completed' && task.drive_link) {
          log(`      ✅ Task completed with drive link!`, 'green');
        } else if (task.status === 'enrolled' || task.status === 'processing') {
          log(`      ⏳ Task is being processed (enrolled/downloading)`, 'yellow');
        } else if (task.status === 'paid') {
          log(`      ⏳ Task is paid, waiting for enrollment`, 'yellow');
        } else if (task.status === 'failed') {
          log(`      ❌ Task failed`, 'red');
          if (task.error_log) {
            log(`      Error: ${task.error_log.substring(0, 200)}`, 'red');
          }
        }
      });
      
      // Step 6: Summary
      logSection('📊 TEST SUMMARY');
      
      const completedTasks = finalTasks.filter(t => t.status === 'completed' && t.drive_link);
      const processingTasks = finalTasks.filter(t => ['paid', 'enrolled', 'processing'].includes(t.status));
      const failedTasks = finalTasks.filter(t => t.status === 'failed');
      
      log(`✅ Completed tasks: ${completedTasks.length}/${finalTasks.length}`, 'green');
      log(`⏳ Processing tasks: ${processingTasks.length}/${finalTasks.length}`, 'yellow');
      if (failedTasks.length > 0) {
        log(`❌ Failed tasks: ${failedTasks.length}/${finalTasks.length}`, 'red');
      }
      
      if (existingDownload && existingDownload.drive_link) {
        log(`\n💡 Note: Course already had drive_link, so access was granted immediately.`, 'yellow');
        log(`   No download was needed.`, 'yellow');
      } else {
        log(`\n💡 Note: Course will be downloaded and uploaded to Google Drive.`, 'yellow');
        log(`   Check task status later to see when download completes.`, 'yellow');
      }
      
      log(`\n✅ Test completed successfully!`, 'green');
      log(`\n📝 Order Details:`, 'cyan');
      log(`   Order Code: ${finalOrder.order_code}`);
      log(`   Email: ${finalOrder.user_email}`);
      log(`   Total: ${finalOrder.total_amount} VND`);
      log(`   Status: ${finalOrder.payment_status} / ${finalOrder.order_status}`);
      
    } catch (orderError) {
      log(`❌ Exception in order processing: ${orderError.message}`, 'red');
      console.error(orderError);
      process.exit(1);
    }
    
    process.exit(0);
    
  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run test
testRealCourseFlow();
