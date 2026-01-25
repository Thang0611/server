/**
 * Script to create order and mark as paid for testing worker logs
 * Usage: node scripts/test-create-and-pay-order.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');
const { Order, DownloadTask } = require('../src/models');
const Logger = require('../src/utils/logger.util');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_COURSE_URL = process.env.TEST_COURSE_URL || 'https://samsungu.udemy.com/course/creative-css-hover-and-animation-effects-in-hindi/';

async function createOrderAndPay() {
  try {
    console.log('🚀 Starting test: Create order and mark as paid\n');
    
    // Step 1: Get course info
    console.log('📋 Step 1: Getting course info...');
    const courseInfoResponse = await axios.post(`${API_BASE_URL}/api/v1/get-course-info`, {
      urls: [TEST_COURSE_URL]
    });
    
    if (!courseInfoResponse.data.success) {
      throw new Error('Failed to get course info');
    }
    
    const validCourses = courseInfoResponse.data.results.filter(c => c.success);
    if (validCourses.length === 0) {
      throw new Error('No valid courses found');
    }
    
    console.log(`✅ Found ${validCourses.length} valid course(s)`);
    console.log(`   Total: ${courseInfoResponse.data.totalAmount} VND\n`);
    
    // Step 2: Create order
    console.log('📦 Step 2: Creating order...');
    const createOrderResponse = await axios.post(`${API_BASE_URL}/api/v1/payment/create-order`, {
      email: TEST_EMAIL,
      courses: validCourses
    });
    
    if (!createOrderResponse.data.success) {
      throw new Error('Failed to create order');
    }
    
    const orderData = createOrderResponse.data;
    console.log(`✅ Order created successfully!`);
    console.log(`   Order ID: ${orderData.orderId}`);
    console.log(`   Order Code: ${orderData.orderCode}`);
    console.log(`   Total Amount: ${orderData.totalAmount} VND`);
    console.log(`   Payment Status: ${orderData.paymentStatus}\n`);
    
    const orderId = orderData.orderId;
    
    // Step 3: Update order to paid
    console.log('💳 Step 3: Updating order to paid status...');
    const order = await Order.findByPk(orderId);
    
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }
    
    await order.update({
      payment_status: 'paid',
      order_status: 'processing'
    });
    
    console.log(`✅ Order ${orderId} updated to paid`);
    console.log(`   Order Code: ${order.order_code}`);
    console.log(`   Payment Status: paid`);
    console.log(`   Order Status: processing\n`);
    
    // Step 4: Get tasks
    console.log('📋 Step 4: Checking download tasks...');
    const tasks = await DownloadTask.findAll({
      where: { order_id: orderId }
    });
    
    console.log(`✅ Found ${tasks.length} task(s):`);
    tasks.forEach(task => {
      console.log(`   Task ${task.id}: ${task.status} - ${task.course_url}`);
    });
    
    console.log('\n✅ Test completed successfully!');
    console.log(`\n📊 Next steps:`);
    console.log(`   1. Check worker logs: pm2 logs workers`);
    console.log(`   2. Check worker-out.log: tail -f logs/worker-out.log`);
    console.log(`   3. Check task log: tail -f logs/tasks/task-${tasks[0]?.id || 'N/A'}.log`);
    console.log(`   4. Monitor Redis queue: redis-cli LLEN rq:queue:downloads`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
    process.exit(1);
  }
}

createOrderAndPay();
