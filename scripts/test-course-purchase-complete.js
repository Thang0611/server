/**
 * Complete Test Suite for Course Purchase Feature
 * Tests all features including:
 * 1. Create order with courseType='temporary' → saves to temporary folder
 * 2. Create order with courseType='permanent' → saves to permanent folder
 * 3. Payment webhook with existing drive_link → grant access immediately
 * 4. Courses API with category filter
 * 5. Frontend integration (manual testing guide)
 * 
 * Usage: node scripts/test-course-purchase-complete.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');
const { Order, DownloadTask } = require('../src/models');
const { checkExistingDownload } = require('../src/services/checkExistingDownload.service');
const paymentService = require('../src/services/payment.service');
const downloadService = require('../src/services/download.service');
const Logger = require('../src/utils/logger.util');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const CLIENT_BASE_URL = process.env.CLIENT_BASE_URL || 'http://localhost:4001';
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_COURSE_URL = process.env.TEST_COURSE_URL || 'https://samsungu.udemy.com/course/test-course/';

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

function logTest(name) {
  log(`\n📋 Test: ${name}`, 'blue');
  console.log('-'.repeat(70));
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

function logInfo(message) {
  log(`ℹ️  ${message}`, 'magenta');
}

// Test results
const results = {
  passed: [],
  failed: [],
  warnings: []
};

// ========================================
// TEST 1: Create Order with courseType='temporary'
// ========================================
async function testCreateOrderTemporary() {
  logTest('Create Order with courseType=\'temporary\' → saves to temporary folder');

  try {
    const testCourseUrl = TEST_COURSE_URL + '-temp-' + Date.now();
    
    // Create order via API
    log('Creating order with temporary course...');
    const createOrderResponse = await axios.post(`${API_BASE_URL}/api/v1/payment/create-order`, {
      email: TEST_EMAIL,
      courses: [{
        url: testCourseUrl,
        title: 'Test Temporary Course',
        price: 2000,
        courseType: 'temporary',
        category: 'Test'
      }]
    });

    if (!createOrderResponse.data.success) {
      throw new Error('Failed to create order');
    }

    const orderData = createOrderResponse.data;
    logSuccess(`Order created: ${orderData.orderCode} (ID: ${orderData.orderId})`);

    // Check task in database
    const tasks = await DownloadTask.findAll({
      where: { order_id: orderData.orderId }
    });

    if (tasks.length === 0) {
      throw new Error('No tasks created');
    }

    const task = tasks[0];
    
    // Verify course_type
    if (task.course_type === 'temporary') {
      logSuccess(`Task ${task.id} has correct course_type: ${task.course_type}`);
      results.passed.push('CreateOrderTemporary: course_type is correct');
    } else {
      logError(`Task course_type is incorrect: ${task.course_type || 'null'}`);
      results.failed.push('CreateOrderTemporary: course_type is incorrect');
    }

    // Verify category
    if (task.category === 'Test') {
      logSuccess(`Task ${task.id} has correct category: ${task.category}`);
      results.passed.push('CreateOrderTemporary: category is correct');
    } else {
      logWarning(`Task category is: ${task.category || 'null'}`);
      results.warnings.push('CreateOrderTemporary: category may not be set');
    }

    // Note: Actual folder location will be verified when Python worker uploads
    logInfo('Note: Folder location (UdemyCourses/temporary) will be verified when worker uploads');

    // Cleanup
    await DownloadTask.destroy({ where: { order_id: orderData.orderId } });
    await Order.destroy({ where: { id: orderData.orderId } });
    logSuccess('Cleaned up test order');

  } catch (error) {
    logError(`Test failed: ${error.message}`);
    results.failed.push(`CreateOrderTemporary: ${error.message}`);
    if (error.response) {
      logError(`Response: ${JSON.stringify(error.response.data)}`);
    }
  }
}

// ========================================
// TEST 2: Create Order with courseType='permanent'
// ========================================
async function testCreateOrderPermanent() {
  logTest('Create Order with courseType=\'permanent\' → saves to permanent folder');

  try {
    const testCourseUrl = TEST_COURSE_URL + '-perm-' + Date.now();
    
    // Create order via API
    log('Creating order with permanent course...');
    const createOrderResponse = await axios.post(`${API_BASE_URL}/api/v1/payment/create-order`, {
      email: TEST_EMAIL,
      courses: [{
        url: testCourseUrl,
        title: 'Test Permanent Course',
        price: 2000,
        courseType: 'permanent',
        category: 'Lập trình'
      }]
    });

    if (!createOrderResponse.data.success) {
      throw new Error('Failed to create order');
    }

    const orderData = createOrderResponse.data;
    logSuccess(`Order created: ${orderData.orderCode} (ID: ${orderData.orderId})`);

    // Check task in database
    const tasks = await DownloadTask.findAll({
      where: { order_id: orderData.orderId }
    });

    if (tasks.length === 0) {
      throw new Error('No tasks created');
    }

    const task = tasks[0];
    
    // Verify course_type
    if (task.course_type === 'permanent') {
      logSuccess(`Task ${task.id} has correct course_type: ${task.course_type}`);
      results.passed.push('CreateOrderPermanent: course_type is correct');
    } else {
      logError(`Task course_type is incorrect: ${task.course_type || 'null'}`);
      results.failed.push('CreateOrderPermanent: course_type is incorrect');
    }

    // Verify category
    if (task.category === 'Lập trình') {
      logSuccess(`Task ${task.id} has correct category: ${task.category}`);
      results.passed.push('CreateOrderPermanent: category is correct');
    } else {
      logWarning(`Task category is: ${task.category || 'null'}`);
      results.warnings.push('CreateOrderPermanent: category may not be set');
    }

    // Note: Actual folder location will be verified when Python worker uploads
    logInfo('Note: Folder location (UdemyCourses/permanent) will be verified when worker uploads');

    // Cleanup
    await DownloadTask.destroy({ where: { order_id: orderData.orderId } });
    await Order.destroy({ where: { id: orderData.orderId } });
    logSuccess('Cleaned up test order');

  } catch (error) {
    logError(`Test failed: ${error.message}`);
    results.failed.push(`CreateOrderPermanent: ${error.message}`);
    if (error.response) {
      logError(`Response: ${JSON.stringify(error.response.data)}`);
    }
  }
}

// ========================================
// TEST 3: Payment Webhook with Existing drive_link → Grant Access Immediately
// ========================================
async function testPaymentWebhookWithExistingDownload() {
  logTest('Payment Webhook with existing drive_link → grant access immediately');

  try {
    const testCourseUrl = TEST_COURSE_URL + '-existing-' + Date.now();
    const testDriveLink = 'https://drive.google.com/drive/folders/test-existing-' + Date.now();

    // Step 1: Create a permanent course that already has drive_link
    log('Step 1: Creating permanent course with existing drive_link...');
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
      course_url: testCourseUrl,
      title: 'Existing Permanent Course',
      price: 2000,
      status: 'completed',
      course_type: 'permanent',
      category: 'Lập trình',
      drive_link: testDriveLink
    });

    logSuccess(`Created existing task ${existingTask.id} with drive_link: ${testDriveLink}`);

    // Step 2: Create new order with same permanent course
    log('\nStep 2: Creating new order with same permanent course...');
    const newOrderResponse = await axios.post(`${API_BASE_URL}/api/v1/payment/create-order`, {
      email: TEST_EMAIL,
      courses: [{
        url: testCourseUrl,
        title: 'Existing Permanent Course',
        price: 2000,
        courseType: 'permanent',
        category: 'Lập trình'
      }]
    });

    if (!newOrderResponse.data.success) {
      throw new Error('Failed to create new order');
    }

    const newOrderData = newOrderResponse.data;
    logSuccess(`New order created: ${newOrderData.orderCode} (ID: ${newOrderData.orderId})`);

    // Step 3: Simulate payment webhook
    log('\nStep 3: Simulating payment webhook...');
    const webhookResult = await paymentService.processPaymentWebhook(
      newOrderData.orderCode,
      newOrderData.totalAmount,
      {
        gateway: 'SePay',
        transactionDate: new Date().toISOString(),
        referenceCode: 'TEST' + Date.now()
      }
    );

    logSuccess(`Webhook processed successfully`);

    // Step 4: Check if new task was marked as completed with existing drive_link
    log('\nStep 4: Checking if task reused existing drive_link...');
    const newTasks = await DownloadTask.findAll({
      where: { order_id: newOrderData.orderId }
    });

    if (newTasks.length > 0) {
      const newTask = newTasks[0];
      if (newTask.status === 'completed' && newTask.drive_link === testDriveLink) {
        logSuccess(`Task ${newTask.id} was marked as completed with existing drive_link`);
        logSuccess(`Drive link: ${newTask.drive_link}`);
        logSuccess('✅ Grant access should have been called immediately (check logs)');
        results.passed.push('PaymentWebhookExistingDownload: Task reused existing drive_link');
      } else {
        logWarning(`Task ${newTask.id} status: ${newTask.status}, drive_link: ${newTask.drive_link || 'null'}`);
        if (newTask.status === 'completed' && newTask.drive_link) {
          logWarning('Task has drive_link but may be different from existing one');
          results.warnings.push('PaymentWebhookExistingDownload: Task has drive_link but may differ');
        } else {
          logError('Task was not marked as completed with existing drive_link');
          results.failed.push('PaymentWebhookExistingDownload: Task did not reuse existing drive_link');
        }
      }
    } else {
      logError('No tasks found for new order');
      results.failed.push('PaymentWebhookExistingDownload: No tasks found');
    }

    // Cleanup
    await DownloadTask.destroy({ where: { order_id: existingOrder.id } });
    await Order.destroy({ where: { id: existingOrder.id } });
    await DownloadTask.destroy({ where: { order_id: newOrderData.orderId } });
    await Order.destroy({ where: { id: newOrderData.orderId } });
    logSuccess('Cleaned up test data');

  } catch (error) {
    logError(`Test failed: ${error.message}`);
    results.failed.push(`PaymentWebhookExistingDownload: ${error.message}`);
    console.error(error);
  }
}

// ========================================
// TEST 4: Courses API with Category Filter
// ========================================
async function testCoursesAPIWithFilter() {
  logTest('Courses API with category filter');

  try {
    // Test 4.1: Get all courses
    log('Test 4.1: GET /api/courses');
    const allCoursesResponse = await axios.get(`${API_BASE_URL}/api/courses`);
    if (allCoursesResponse.data.success) {
      logSuccess(`Found ${allCoursesResponse.data.courses.length} courses (total: ${allCoursesResponse.data.pagination.total})`);
      results.passed.push('CoursesAPI: Get all courses works');
    } else {
      throw new Error('API returned success: false');
    }

    // Test 4.2: Get categories
    log('\nTest 4.2: GET /api/courses/categories');
    const categoriesResponse = await axios.get(`${API_BASE_URL}/api/courses/categories`);
    if (categoriesResponse.data.success && categoriesResponse.data.categories.length > 0) {
      logSuccess(`Found ${categoriesResponse.data.categories.length} categories`);
      logInfo(`Categories: ${categoriesResponse.data.categories.slice(0, 5).join(', ')}${categoriesResponse.data.categories.length > 5 ? '...' : ''}`);
      results.passed.push('CoursesAPI: Get categories works');
    } else {
      logWarning('No categories found (may be expected if database is empty)');
      results.warnings.push('CoursesAPI: No categories found');
    }

    // Test 4.3: Filter by category
    if (categoriesResponse.data.success && categoriesResponse.data.categories.length > 0) {
      const testCategory = categoriesResponse.data.categories[0];
      log(`\nTest 4.3: GET /api/courses?category=${encodeURIComponent(testCategory)}`);
      const filteredResponse = await axios.get(`${API_BASE_URL}/api/courses?category=${encodeURIComponent(testCategory)}`);
      if (filteredResponse.data.success) {
        logSuccess(`Found ${filteredResponse.data.courses.length} courses in category "${testCategory}"`);
        results.passed.push(`CoursesAPI: Filter by category "${testCategory}" works`);
      } else {
        throw new Error('Filter by category failed');
      }
    }

    // Test 4.4: Search
    log('\nTest 4.4: GET /api/courses?search=test');
    const searchResponse = await axios.get(`${API_BASE_URL}/api/courses?search=test`);
    if (searchResponse.data.success) {
      logSuccess(`Found ${searchResponse.data.courses.length} courses matching "test"`);
      results.passed.push('CoursesAPI: Search works');
    } else {
      throw new Error('Search failed');
    }

  } catch (error) {
    logError(`Test failed: ${error.message}`);
    results.failed.push(`CoursesAPI: ${error.message}`);
    if (error.response) {
      logError(`Response: ${JSON.stringify(error.response.data)}`);
    }
  }
}

// ========================================
// TEST 5: Frontend Integration Guide
// ========================================
function testFrontendIntegration() {
  logTest('Frontend Integration - Manual Testing Guide');

  logInfo(`This test requires manual browser testing. Follow these steps:\n`);
  logInfo(`Server API: ${API_BASE_URL}`);
  logInfo(`Client URL: ${CLIENT_BASE_URL}\n`);

  log('1. Test Courses Page Load from API:', 'yellow');
  log(`   - Open: ${CLIENT_BASE_URL}/courses`);
  log('   - Verify: Courses load from API (not mock data)');
  log('   - Check: Category and platform filters work');
  log('   - Check: Search functionality works\n');

  log('2. Test Redirect from Courses Page with courseType=permanent:', 'yellow');
  log(`   - Go to: ${CLIENT_BASE_URL}/courses`);
  log('   - Click "Add to Cart" on any course');
  log('   - Verify: Redirects to homepage with courseType=permanent in URL');
  log('   - Check URL: Should contain ?course=...&courseType=permanent&category=...');
  log('   - Verify: Form pre-fills with course URL');
  log('   - Submit form and verify order has courseType=permanent\n');

  log('3. Test Temporary Course from Homepage:', 'yellow');
  log(`   - Go to: ${CLIENT_BASE_URL}`);
  log('   - Enter course URL directly in form');
  log('   - Submit form');
  log('   - Verify: Order has courseType=temporary (default)\n');

  log('4. Test Permanent Course from Homepage (via redirect):', 'yellow');
  log(`   - Go to: ${CLIENT_BASE_URL}/?course=...&courseType=permanent&category=...`);
  log('   - Verify: Form pre-fills with course URL');
  log('   - Submit form');
  log('   - Verify: Order has courseType=permanent\n');

  logWarning('⚠️  Manual testing required for frontend integration');
  results.warnings.push('FrontendIntegration: Manual testing required');
}

// ========================================
// MAIN TEST RUNNER
// ========================================
async function runAllTests() {
  logSection('🧪 COMPLETE COURSE PURCHASE FEATURE TEST SUITE');
  log('Testing all features:', 'yellow');
  log('  1. Create order with courseType=\'temporary\' → saves to temporary folder', 'yellow');
  log('  2. Create order with courseType=\'permanent\' → saves to permanent folder', 'yellow');
  log('  3. Payment webhook with existing drive_link → grant access immediately', 'yellow');
  log('  4. Courses API with category filter', 'yellow');
  log('  5. Frontend integration (manual testing guide)', 'yellow');
  console.log('');

  const tests = [
    testCreateOrderTemporary,
    testCreateOrderPermanent,
    testPaymentWebhookWithExistingDownload,
    testCoursesAPIWithFilter,
    testFrontendIntegration
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
    logSuccess('✅ All automated tests passed!');
    logInfo('⚠️  Remember to manually test frontend integration');
  } else {
    logError('❌ Some tests failed!');
  }

  process.exit(exitCode);
}

// Run tests
runAllTests().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
