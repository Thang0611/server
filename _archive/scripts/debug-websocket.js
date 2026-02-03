/**
 * WebSocket Debug Script
 * 
 * This script helps debug WebSocket connection issues by:
 * 1. Testing Redis Pub/Sub channels
 * 2. Monitoring Socket.io connections
 * 3. Simulating progress events
 * 
 * Usage:
 *   node server/scripts/debug-websocket.js [taskId] [orderId]
 * 
 * Example:
 *   node server/scripts/debug-websocket.js 123 456
 */

const redis = require('redis');
const { io } = require('socket.io-client');
require('dotenv').config();

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const SOCKET_URL = process.env.FRONTEND_URL || 'http://localhost:3001';

// Parse command line arguments
const taskId = process.argv[2] ? parseInt(process.argv[2], 10) : 123;
const orderId = process.argv[3] ? parseInt(process.argv[3], 10) : 456;

console.log('🔍 WebSocket Debug Script');
console.log('========================');
console.log(`Task ID: ${taskId}`);
console.log(`Order ID: ${orderId}`);
console.log(`Socket URL: ${SOCKET_URL}`);
console.log('');

// ============================================
// 1. Test Redis Connection and Channels
// ============================================
async function testRedis() {
  console.log('📡 Testing Redis Connection...');
  
  const redisClient = redis.createClient({
    socket: {
      host: REDIS_HOST,
      port: REDIS_PORT,
    },
    password: REDIS_PASSWORD,
  });

  redisClient.on('error', (err) => {
    console.error('❌ Redis Error:', err);
  });

  try {
    await redisClient.connect();
    console.log('✅ Redis connected successfully');
    
    // Subscribe to task progress channel
    const taskChannel = `task:${taskId}:progress`;
    const orderChannel = `order:${orderId}:progress`;
    
    console.log(`\n📥 Subscribing to channels:`);
    console.log(`   - ${taskChannel}`);
    console.log(`   - ${orderChannel}`);
    
    const subscriber = redisClient.duplicate();
    await subscriber.connect();
    
    await subscriber.pSubscribe('task:*:progress');
    await subscriber.pSubscribe('order:*:progress');
    
    subscriber.on('pmessage', (pattern, channel, message) => {
      console.log(`\n📨 Redis Message Received:`);
      console.log(`   Pattern: ${pattern}`);
      console.log(`   Channel: ${channel}`);
      console.log(`   Message: ${message.substring(0, 200)}`);
      
      try {
        const data = JSON.parse(message);
        console.log(`   Parsed Data:`, JSON.stringify(data, null, 2));
      } catch (e) {
        console.log(`   ⚠️ Failed to parse JSON:`, e.message);
      }
    });
    
    console.log('✅ Redis subscriber active - waiting for messages...\n');
    
    // Publish a test message
    console.log('📤 Publishing test message...');
    const testMessage = JSON.stringify({
      taskId,
      orderId,
      percent: 50,
      currentFile: 'test-lecture.mp4',
      speed: 1024000,
      timestamp: Date.now()
    });
    
    await redisClient.publish(taskChannel, testMessage);
    console.log(`✅ Published to ${taskChannel}`);
    
    await redisClient.publish(orderChannel, testMessage);
    console.log(`✅ Published to ${orderChannel}`);
    
    // Keep connection alive
    setTimeout(async () => {
      await subscriber.quit();
      await redisClient.quit();
      console.log('\n✅ Redis connections closed');
    }, 30000);
    
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    process.exit(1);
  }
}

// ============================================
// 2. Test Socket.io Connection
// ============================================
async function testSocketIO() {
  console.log('\n🔌 Testing Socket.io Connection...');
  
  const socket = io(SOCKET_URL, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnection: true,
  });
  
  socket.on('connect', () => {
    console.log('✅ Socket.io connected:', socket.id);
    
    // Subscribe to task
    console.log(`\n📤 Subscribing to task:${taskId}...`);
    socket.emit('subscribe:task', { taskId });
    
    setTimeout(() => {
      console.log(`\n📤 Subscribing to order:${orderId}...`);
      socket.emit('subscribe:order', { orderId });
    }, 1000);
  });
  
  socket.on('connected', (data) => {
    console.log('✅ Server confirmed connection:', data);
  });
  
  socket.on('subscribed', (data) => {
    console.log('✅ Subscription confirmed:', data);
  });
  
  socket.on('progress', (data) => {
    console.log('\n📊 Progress event received:');
    console.log(JSON.stringify(data, null, 2));
  });
  
  socket.on('status', (data) => {
    console.log('\n🔄 Status event received:');
    console.log(JSON.stringify(data, null, 2));
  });
  
  socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
  });
  
  socket.on('disconnect', (reason) => {
    console.log('❌ Socket disconnected:', reason);
  });
  
  socket.on('connect_error', (error) => {
    console.error('❌ Connection error:', error.message);
  });
  
  // Keep connection alive
  setTimeout(() => {
    socket.disconnect();
    console.log('\n✅ Socket.io connection closed');
  }, 30000);
}

// ============================================
// 3. Monitor All Redis Channels
// ============================================
async function monitorRedis() {
  console.log('\n👁️  Monitoring All Redis Channels...');
  
  const subscriber = redis.createClient({
    socket: {
      host: REDIS_HOST,
      port: REDIS_PORT,
    },
    password: REDIS_PASSWORD,
  });
  
  await subscriber.connect();
  
  // Subscribe to all progress-related patterns
  const patterns = [
    'task:*:progress',
    'task:*:status',
    'order:*:progress',
    'order:*:status',
    'order:*:complete'
  ];
  
  for (const pattern of patterns) {
    await subscriber.pSubscribe(pattern);
    console.log(`✅ Subscribed to pattern: ${pattern}`);
  }
  
  subscriber.on('pmessage', (pattern, channel, message) => {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] 📨 Redis Message`);
    console.log(`   Pattern: ${pattern}`);
    console.log(`   Channel: ${channel}`);
    
    try {
      const data = JSON.parse(message);
      if (data.percent !== undefined) {
        console.log(`   Progress: ${data.percent}%`);
      }
      if (data.newStatus) {
        console.log(`   Status: ${data.newStatus}`);
      }
      console.log(`   Full Data:`, JSON.stringify(data, null, 2));
    } catch (e) {
      console.log(`   Raw Message: ${message.substring(0, 200)}`);
    }
  });
  
  console.log('\n✅ Monitoring active - press Ctrl+C to stop\n');
}

// ============================================
// Main Execution
// ============================================
async function main() {
  const mode = process.argv[4] || 'all';
  
  if (mode === 'redis') {
    await testRedis();
  } else if (mode === 'socket') {
    await testSocketIO();
  } else if (mode === 'monitor') {
    await monitorRedis();
  } else {
    // Run all tests
    await testRedis();
    await testSocketIO();
    
    // Keep process alive
    setTimeout(() => {
      console.log('\n✅ Debug session complete');
      process.exit(0);
    }, 35000);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down...');
  process.exit(0);
});

main().catch(console.error);
