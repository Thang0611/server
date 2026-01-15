/**
 * Quick script to update order to paid status for testing
 * Usage: node server/scripts/test-update-order-paid.js <orderId>
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Order, DownloadTask } = require('../src/models');
const Logger = require('../src/utils/logger.util');

async function updateOrderToPaid(orderId) {
  try {
    const order = await Order.findByPk(orderId);
    
    if (!order) {
      console.log(`❌ Order ${orderId} not found`);
      return;
    }
    
    console.log(`📋 Current order status:`, {
      id: order.id,
      orderCode: order.order_code,
      paymentStatus: order.payment_status,
      orderStatus: order.order_status
    });
    
    // Update to paid
    await order.update({
      payment_status: 'paid',
      order_status: 'processing'
    });
    
    console.log(`✅ Order ${orderId} updated to paid`);
    console.log(`   Order Code: ${order.order_code}`);
    console.log(`   Payment Status: paid`);
    console.log(`   Order Status: processing`);
    
    // Get tasks
    const tasks = await DownloadTask.findAll({
      where: { order_id: orderId }
    });
    
    console.log(`\n📋 Tasks (${tasks.length}):`);
    tasks.forEach(task => {
      console.log(`   Task ${task.id}: ${task.status}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

const orderId = process.argv[2] ? parseInt(process.argv[2]) : 17;
updateOrderToPaid(orderId);
