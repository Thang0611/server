/**
 * Test script for Course Purchase Feature
 * Tests:
 * 1. Check existing download service (permanent vs temporary)
 * 2. Create order with course_type and category
 * 3. Payment webhook with existing download check
 * 
 * Usage: node scripts/test-course-purchase-feature.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Order, DownloadTask } = require('../src/models');
const { checkExistingDownload } = require('../src/services/checkExistingDownload.service');
const paymentService = require('../src/services/payment.service');
const downloadService = require('../src/services/download.service');
const Logger = require('../src/utils/logger.util');

const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_COURSE_URL = 'https://samsungu.udemy.com/course/test-course-permanent/';
const TEST_COURSE_URL_TEMPORARY = 'https://samsungu.udemy.com/course/test-course-temporary/';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60) + '\n');
}

function logTest(name) {
  log(`\n📋 Test: ${name}`, 'blue');
  console.log('-'.repeat(60));
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

// Test results
const results = {
  passed: [],
  failed: [],
  warnings: []
};

// ========================================
// TEST 1: Check Existing Download Service
// ========================================
async function testCheckExistingDownload() {
  logTest('Check Existing Download Service');

  try {
    // Test 1.1: Temporary course should return null
    log('Test 1.1: Temporary course should not find existing download');
    const tempResult = await checkExistingDownload(TEST_COURSE_URL_TEMPORARY, 'temporary');
    if (tempResult === null) {
      logSuccess('Temporary course correctly returns null');
      results.passed.push('CheckExistingDownload: Temporary course returns null');
    } else {
      logError('Temporary course should return null but got result');
      results.failed.push('CheckExistingDownload: Temporary course should return null');
    }

    // Test 1.2: Permanent course without existing download
    log('\nTest 1.2: Permanent course without existing download');
    const permNoResult = await checkExistingDownload(TEST_COURSE_URL, 'permanent');
    if (permNoResult === null) {
      logSuccess('Permanent course without existing download correctly returns null');
      results.passed.push('CheckExistingDownload: Permanent course without existing returns null');
    } else {
      logWarning('Permanent course found existing download (may be expected if course was downloaded before)');
      results.warnings.push('CheckExistingDownload: Permanent course has existing download');
    }

    // Test 1.3: Create a test permanent course with drive_link
    log('\nTest 1.3: Create test permanent course with drive_link');
    const testOrder = await Order.create({
      order_code: 'TEST' + Date.now(),
      user_email: TEST_EMAIL,
      total_amount: 2000,
      payment_status: 'paid',
      order_status: 'completed'
    });

    const testTask = await DownloadTask.create({
      order_id: testOrder.id,
      email: TEST_EMAIL,
      course_url: TEST_COURSE_URL,
      title: 'Test Permanent Course',
      price: 2000,
      status: 'completed',
      course_type: 'permanent',
      category: 'Lập trình',
      drive_link: 'https://drive.google.com/drive/folders/test123'
    });

    logSuccess(`Created test task ${testTask.id} with drive_link`);

    // Test 1.4: Check if we can find the test task
    log('\nTest 1.4: Check if permanent course with drive_link is found');
    const permWithResult = await checkExistingDownload(TEST_COURSE_URL, 'permanent');
    if (permWithResult && permWithResult.drive_link) {
      logSuccess(`Found existing download: ${permWithResult.drive_link}`);
      results.passed.push('CheckExistingDownload: Permanent course with drive_link is found');
    } else {
      logError('Permanent course with drive_link not found');
      results.failed.push('CheckExistingDownload: Permanent course with drive_link not found');
    }

    // Cleanup test data
    await testTask.destroy();
    await testOrder.destroy();
    logSuccess('Cleaned up test data');

  } catch (error) {
    logError(`Test failed: ${error.message}`);
    results.failed.push(`CheckExistingDownload: ${error.message}`);
    console.error(error);
  }
}

// ========================================
// TEST 2: Create Order with course_type and category
// ========================================
async function testCreateOrderWithCourseType() {
  logTest('Create Order with course_type and category');

  try {
    // Test 2.1: Create order with temporary course
    log('Test 2.1: Create order with temporary course');
    const tempCourses = [{
      url: TEST_COURSE_URL_TEMPORARY,
      title: 'Test Temporary Course',
      price: 2000,
      courseType: 'temporary',
      category: 'Test'
    }];

    const tempOrder = await paymentService.createOrder(TEST_EMAIL, tempCourses);
    logSuccess(`Order created: ${tempOrder.orderCode} (ID: ${tempOrder.orderId})`);

    // Check if task has correct course_type
    const tempTasks = await DownloadTask.findAll({
      where: { order_id: tempOrder.orderId }
    });

    if (tempTasks.length > 0 && tempTasks[0].course_type === 'temporary') {
      logSuccess(`Task has correct course_type: ${tempTasks[0].course_type}`);
      results.passed.push('CreateOrder: Temporary course_type is set correctly');
    } else {
      logError(`Task course_type is incorrect: ${tempTasks[0]?.course_type || 'null'}`);
      results.failed.push('CreateOrder: Temporary course_type not set correctly');
    }

    // Test 2.2: Create order with permanent course
    log('\nTest 2.2: Create order with permanent course');
    const permCourses = [{
      url: TEST_COURSE_URL,
      title: 'Test Permanent Course',
      price: 2000,
      courseType: 'permanent',
      category: 'Lập trình'
    }];

    const permOrder = await paymentService.createOrder(TEST_EMAIL, permCourses);
    logSuccess(`Order created: ${permOrder.orderCode} (ID: ${permOrder.orderId})`);

    // Check if task has correct course_type and category
    const permTasks = await DownloadTask.findAll({
      where: { order_id: permOrder.orderId }
    });

    if (permTasks.length > 0) {
      const task = permTasks[0];
      if (task.course_type === 'permanent') {
        logSuccess(`Task has correct course_type: ${task.course_type}`);
        results.passed.push('CreateOrder: Permanent course_type is set correctly');
      } else {
        logError(`Task course_type is incorrect: ${task.course_type}`);
        results.failed.push('CreateOrder: Permanent course_type not set correctly');
      }

      if (task.category === 'Lập trình') {
        logSuccess(`Task has correct category: ${task.category}`);
        results.passed.push('CreateOrder: Category is set correctly');
      } else {
        logWarning(`Task category is: ${task.category || 'null'}`);
        results.warnings.push('CreateOrder: Category may not be set correctly');
      }
    } else {
      logError('No tasks found for permanent order');
      results.failed.push('CreateOrder: No tasks created for permanent order');
    }

    // Cleanup
    await DownloadTask.destroy({ where: { order_id: tempOrder.orderId } });
    await Order.destroy({ where: { id: tempOrder.orderId } });
    await DownloadTask.destroy({ where: { order_id: permOrder.orderId } });
    await Order.destroy({ where: { id: permOrder.orderId } });
    logSuccess('Cleaned up test orders');

  } catch (error) {
    logError(`Test failed: ${error.message}`);
    results.failed.push(`CreateOrder: ${error.message}`);
    console.error(error);
  }
}

// ========================================
// TEST 3: Payment Webhook with Existing Download Check
// ========================================
async function testPaymentWebhookWithExistingDownload() {
  logTest('Payment Webhook with Existing Download Check');

  try {
    // Step 1: Create a permanent course that already has drive_link
    log('Step 1: Create permanent course with existing drive_link');
    const existingOrder = await Order.create({
      order_code: 'EXIST' + Date.now(),
      user_email: TEST_EMAIL,
      total_amount: 2000,
      payment_status: 'paid',
      order_status: 'completed'
    });

    const existingTask = await DownloadTask.create({
      order_id: existingOrder.id,
      email: TEST_EMAIL,
      course_url: TEST_COURSE_URL,
      title: 'Existing Permanent Course',
      price: 2000,
      status: 'completed',
      course_type: 'permanent',
      category: 'Lập trình',
      drive_link: 'https://drive.google.com/drive/folders/existing123'
    });

    logSuccess(`Created existing task ${existingTask.id} with drive_link`);

    // Step 2: Create new order with same permanent course
    log('\nStep 2: Create new order with same permanent course');
    const newCourses = [{
      url: TEST_COURSE_URL,
      title: 'Existing Permanent Course',
      price: 2000,
      courseType: 'permanent',
      category: 'Lập trình'
    }];

    const newOrder = await paymentService.createOrder(TEST_EMAIL, newCourses);
    logSuccess(`New order created: ${newOrder.orderCode} (ID: ${newOrder.orderId})`);

    // Step 3: Simulate payment webhook
    log('\nStep 3: Simulate payment webhook');
    const webhookResult = await paymentService.processPaymentWebhook(
      newOrder.orderCode,
      newOrder.totalAmount,
      {
        gateway: 'SePay',
        transactionDate: new Date().toISOString(),
        referenceCode: 'TEST' + Date.now()
      }
    );

    logSuccess(`Webhook processed: ${JSON.stringify(webhookResult)}`);

    // Step 4: Check if new task was marked as completed with existing drive_link
    log('\nStep 4: Check if new task reused existing drive_link');
    const newTasks = await DownloadTask.findAll({
      where: { order_id: newOrder.orderId }
    });

    if (newTasks.length > 0) {
      const newTask = newTasks[0];
      if (newTask.status === 'completed' && newTask.drive_link) {
        logSuccess(`Task ${newTask.id} was marked as completed with drive_link: ${newTask.drive_link}`);
        results.passed.push('PaymentWebhook: Permanent course reused existing drive_link');
      } else {
        logWarning(`Task ${newTask.id} status: ${newTask.status}, drive_link: ${newTask.drive_link || 'null'}`);
        results.warnings.push('PaymentWebhook: Task may not have reused existing drive_link');
      }
    } else {
      logError('No tasks found for new order');
      results.failed.push('PaymentWebhook: No tasks found');
    }

    // Cleanup
    await DownloadTask.destroy({ where: { order_id: existingOrder.id } });
    await Order.destroy({ where: { id: existingOrder.id } });
    await DownloadTask.destroy({ where: { order_id: newOrder.orderId } });
    await Order.destroy({ where: { id: newOrder.orderId } });
    logSuccess('Cleaned up test data');

  } catch (error) {
    logError(`Test failed: ${error.message}`);
    results.failed.push(`PaymentWebhook: ${error.message}`);
    console.error(error);
  }
}

// ========================================
// TEST 4: Payment Webhook - Permanent Course Already Exists
// ========================================
async function testPaymentWebhookPermanentExists() {
  logTest('Payment Webhook - Permanent Course Already Exists');

  try {
    // Step 1: Create a permanent course that already has drive_link
    log('Step 1: Create permanent course with existing drive_link');
    const existingOrder = await Order.create({
      order_code: 'EXIST' + Date.now(),
      user_email: TEST_EMAIL,
      total_amount: 2000,
      payment_status: 'paid',
      order_status: 'completed'
    });

    const existingTask = await DownloadTask.create({
      order_id: existingOrder.id,
      email: TEST_EMAIL,
      course_url: TEST_COURSE_URL,
      title: 'Existing Permanent Course',
      price: 2000,
      status: 'completed',
      course_type: 'permanent',
      category: 'Lập trình',
      drive_link: 'https://drive.google.com/drive/folders/existing123'
    });

    logSuccess(`Created existing task ${existingTask.id} with drive_link`);

    // Step 2: Create new order with same permanent course
    log('\nStep 2: Create new order with same permanent course');
    const newCourses = [{
      url: TEST_COURSE_URL,
      title: 'Existing Permanent Course',
      price: 2000,
      courseType: 'permanent',
      category: 'Lập trình'
    }];

    const newOrder = await paymentService.createOrder(TEST_EMAIL, newCourses);
    logSuccess(`New order created: ${newOrder.orderCode} (ID: ${newOrder.orderId})`);

    // Step 3: Simulate payment webhook
    log('\nStep 3: Simulate payment webhook');
    const webhookResult = await paymentService.processPaymentWebhook(
      newOrder.orderCode,
      newOrder.totalAmount,
      {
        gateway: 'SePay',
        transactionDate: new Date().toISOString(),
        referenceCode: 'TEST' + Date.now()
      }
    );

    logSuccess(`Webhook processed: ${JSON.stringify(webhookResult)}`);

    // Step 4: Check if new task was marked as completed with existing drive_link
    log('\nStep 4: Check if new task reused existing drive_link');
    const newTasks = await DownloadTask.findAll({
      where: { order_id: newOrder.orderId }
    });

    if (newTasks.length > 0) {
      const newTask = newTasks[0];
      if (newTask.status === 'completed' && newTask.drive_link) {
        logSuccess(`Task ${newTask.id} was marked as completed with drive_link: ${newTask.drive_link}`);
        logSuccess('✅ Permanent course with existing drive_link was REUSED (no download needed)');
        results.passed.push('PaymentWebhook: Permanent course with existing drive_link was reused');
      } else {
        logError(`Task ${newTask.id} status: ${newTask.status}, drive_link: ${newTask.drive_link || 'null'}`);
        results.failed.push('PaymentWebhook: Permanent course with existing drive_link was not reused');
      }
    } else {
      logError('No tasks found for new order');
      results.failed.push('PaymentWebhook: No tasks found');
    }

    // Cleanup
    await DownloadTask.destroy({ where: { order_id: existingOrder.id } });
    await Order.destroy({ where: { id: existingOrder.id } });
    await DownloadTask.destroy({ where: { order_id: newOrder.orderId } });
    await Order.destroy({ where: { id: newOrder.orderId } });
    logSuccess('Cleaned up test data');

  } catch (error) {
    logError(`Test failed: ${error.message}`);
    results.failed.push(`PaymentWebhookPermanentExists: ${error.message}`);
    console.error(error);
  }
}

// ========================================
// TEST 5: Payment Webhook - Permanent Course Does Not Exist
// ========================================
async function testPaymentWebhookPermanentNotExists() {
  logTest('Payment Webhook - Permanent Course Does Not Exist');

  try {
    // Step 1: Create new order with permanent course that does NOT exist
    log('Step 1: Create new order with permanent course (no existing download)');
    const newCourseUrl = 'https://samsungu.udemy.com/course/new-permanent-course-' + Date.now() + '/';
    const newCourses = [{
      url: newCourseUrl,
      title: 'New Permanent Course',
      price: 2000,
      courseType: 'permanent',
      category: 'Thiết kế'
    }];

    const newOrder = await paymentService.createOrder(TEST_EMAIL, newCourses);
    logSuccess(`New order created: ${newOrder.orderCode} (ID: ${newOrder.orderId})`);

    // Step 2: Verify task was created with correct course_type
    const tasksBefore = await DownloadTask.findAll({
      where: { order_id: newOrder.orderId }
    });

    if (tasksBefore.length > 0) {
      const task = tasksBefore[0];
      if (task.course_type === 'permanent') {
        logSuccess(`Task ${task.id} has correct course_type: ${task.course_type}`);
      } else {
        logError(`Task course_type is incorrect: ${task.course_type}`);
        results.failed.push('PaymentWebhookPermanentNotExists: Task course_type incorrect');
      }
    }

    // Step 3: Simulate payment webhook
    log('\nStep 2: Simulate payment webhook');
    const webhookResult = await paymentService.processPaymentWebhook(
      newOrder.orderCode,
      newOrder.totalAmount,
      {
        gateway: 'SePay',
        transactionDate: new Date().toISOString(),
        referenceCode: 'TEST' + Date.now()
      }
    );

    logSuccess(`Webhook processed: ${JSON.stringify(webhookResult)}`);

    // Step 4: Check if task needs download (status should be processing or enrolled, NOT completed)
    log('\nStep 3: Check if task needs download (should NOT be completed)');
    const tasksAfter = await DownloadTask.findAll({
      where: { order_id: newOrder.orderId }
    });

    if (tasksAfter.length > 0) {
      const task = tasksAfter[0];
      // Task should be in processing/enrolled status, NOT completed (because no existing drive_link)
      if (task.status === 'completed' && task.drive_link) {
        logWarning(`Task ${task.id} was marked as completed with drive_link: ${task.drive_link}`);
        logWarning('⚠️  This might be unexpected - permanent course without existing should need download');
        results.warnings.push('PaymentWebhookPermanentNotExists: Task was completed unexpectedly');
      } else if (['processing', 'enrolled'].includes(task.status)) {
        logSuccess(`Task ${task.id} status: ${task.status} (needs download - correct behavior)`);
        logSuccess('✅ Permanent course without existing drive_link will be DOWNLOADED');
        results.passed.push('PaymentWebhook: Permanent course without existing will be downloaded');
      } else {
        logWarning(`Task ${task.id} status: ${task.status} (unexpected status)`);
        results.warnings.push(`PaymentWebhookPermanentNotExists: Unexpected status ${task.status}`);
      }
    } else {
      logError('No tasks found for new order');
      results.failed.push('PaymentWebhookPermanentNotExists: No tasks found');
    }

    // Cleanup
    await DownloadTask.destroy({ where: { order_id: newOrder.orderId } });
    await Order.destroy({ where: { id: newOrder.orderId } });
    logSuccess('Cleaned up test data');

  } catch (error) {
    logError(`Test failed: ${error.message}`);
    results.failed.push(`PaymentWebhookPermanentNotExists: ${error.message}`);
    console.error(error);
  }
}

// ========================================
// MAIN TEST RUNNER
// ========================================
async function runAllTests() {
  logSection('🧪 COURSE PURCHASE FEATURE TEST SUITE');
  log('Testing new features:', 'yellow');
  log('  1. Check Existing Download Service', 'yellow');
  log('  2. Create Order with course_type and category', 'yellow');
  log('  3. Payment Webhook with Existing Download Check', 'yellow');
  log('  4. Payment Webhook - Permanent Course Already Exists', 'yellow');
  log('  5. Payment Webhook - Permanent Course Does Not Exist', 'yellow');
  console.log('');

  const tests = [
    testCheckExistingDownload,
    testCreateOrderWithCourseType,
    testPaymentWebhookWithExistingDownload,
    testPaymentWebhookPermanentExists,
    testPaymentWebhookPermanentNotExists
  ];

  for (const test of tests) {
    try {
      await test();
    } catch (error) {
      logError(`Test runner error: ${error.message}`);
      console.error(error);
    }
  }

  // Print Summary
  logSection('📊 TEST SUMMARY');

  logSuccess(`PASSED: ${results.passed.length} test(s)`);
  results.passed.forEach(r => console.log(`  ✓ ${r}`));

  console.log('');

  if (results.warnings.length > 0) {
    logWarning(`WARNINGS: ${results.warnings.length} item(s)`);
    results.warnings.forEach(r => console.log(`  ⚠ ${r}`));
    console.log('');
  }

  if (results.failed.length > 0) {
    logError(`FAILED: ${results.failed.length} test(s)`);
    results.failed.forEach(r => console.log(`  ✗ ${r}`));
  }

  console.log('');

  // Exit code
  const exitCode = results.failed.length > 0 ? 1 : 0;
  if (exitCode === 0) {
    logSuccess('All tests passed!');
  } else {
    logError('Some tests failed!');
  }

  process.exit(exitCode);
}

// Run tests
runAllTests().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
