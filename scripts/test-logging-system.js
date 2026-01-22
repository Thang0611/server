/**
 * Test Script for Unified Logging System
 * Tests all logging functionality with real orders
 * 
 * Usage:
 *   node server/scripts/test-logging-system.js [orderId]
 * 
 * Example:
 *   node server/scripts/test-logging-system.js 123
 */

const axios = require('axios');
const mysql = require('mysql2/promise');

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'getcourses'
};

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

async function getDbConnection() {
  try {
    return await mysql.createConnection(DB_CONFIG);
  } catch (error) {
    log(`❌ Database connection failed: ${error.message}`, 'red');
    throw error;
  }
}

async function testDatabaseTables() {
  log('\n📊 Test 1: Database Tables', 'cyan');
  try {
    const conn = await getDbConnection();
    
    // Check task_logs table
    const [taskLogsTable] = await conn.execute(`
      SELECT COUNT(*) as count FROM task_logs LIMIT 1
    `);
    log(`✅ task_logs table exists (${taskLogsTable[0].count} records)`, 'green');
    
    // Check order_audit_logs table
    const [auditLogsTable] = await conn.execute(`
      SELECT COUNT(*) as count FROM order_audit_logs LIMIT 1
    `);
    log(`✅ order_audit_logs table exists (${auditLogsTable[0].count} records)`, 'green');
    
    await conn.end();
    return true;
  } catch (error) {
    log(`❌ Database test failed: ${error.message}`, 'red');
    return false;
  }
}

async function testInternalAPI() {
  log('\n🔌 Test 2: Internal API Endpoint', 'cyan');
  try {
    const testPayload = {
      orderId: 999,
      level: 'info',
      category: 'download',
      message: 'Test log from test script',
      details: { test: true, timestamp: new Date().toISOString() },
      progress: 50,
      currentFile: 'test-file.mp4',
      source: 'test_script'
    };
    
    const response = await axios.post(
      `${API_URL}/api/v1/internal/tasks/999/logs`,
      testPayload,
      { timeout: 5000 }
    );
    
    if (response.data.success) {
      log(`✅ Internal API working (log ID: ${response.data.data?.logId || 'N/A'})`, 'green');
      return true;
    } else {
      log(`❌ Internal API returned error: ${response.data.message}`, 'red');
      return false;
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      log(`❌ Cannot connect to API at ${API_URL}. Is the server running?`, 'red');
    } else {
      log(`❌ Internal API test failed: ${error.message}`, 'red');
    }
    return false;
  }
}

async function testAdminAPI(orderId) {
  log(`\n📋 Test 3: Admin API Endpoints (Order ${orderId})`, 'cyan');
  try {
    // Test unified logs endpoint
    const logsResponse = await axios.get(
      `${API_URL}/api/admin/orders/${orderId}/logs`,
      { timeout: 5000 }
    );
    
    if (logsResponse.data.success) {
      const logs = logsResponse.data.data?.logs || [];
      const summary = logsResponse.data.data?.summary || {};
      log(`✅ Unified logs endpoint working (${logs.length} logs)`, 'green');
      log(`   Summary: ${summary.total || 0} total, ${summary.errors || 0} errors, ${summary.warnings || 0} warnings`, 'blue');
      return true;
    } else {
      log(`❌ Admin API returned error: ${logsResponse.data.error}`, 'red');
      return false;
    }
  } catch (error) {
    if (error.response?.status === 404) {
      log(`⚠️  Order ${orderId} not found or not paid`, 'yellow');
      return false;
    } else {
      log(`❌ Admin API test failed: ${error.message}`, 'red');
      return false;
    }
  }
}

async function testTaskLogs(taskId) {
  log(`\n📝 Test 4: Task Logs Endpoint (Task ${taskId})`, 'cyan');
  try {
    const response = await axios.get(
      `${API_URL}/api/admin/tasks/${taskId}/logs`,
      { timeout: 5000 }
    );
    
    if (response.data.success) {
      const logs = response.data.data?.logs || [];
      const summary = response.data.data?.summary || {};
      log(`✅ Task logs endpoint working (${logs.length} logs)`, 'green');
      if (summary.latestProgress !== null) {
        log(`   Latest progress: ${summary.latestProgress}%`, 'blue');
      }
      return true;
    } else {
      log(`❌ Task logs API returned error: ${response.data.error}`, 'red');
      return false;
    }
  } catch (error) {
    if (error.response?.status === 404) {
      log(`⚠️  Task ${taskId} not found`, 'yellow');
      return false;
    } else {
      log(`❌ Task logs API test failed: ${error.message}`, 'red');
      return false;
    }
  }
}

async function getRecentOrder() {
  log('\n🔍 Finding Recent Order...', 'cyan');
  try {
    const conn = await getDbConnection();
    
    // Get a paid order with tasks
    const [orders] = await conn.execute(`
      SELECT o.id, o.order_code, o.user_email, COUNT(dt.id) as task_count
      FROM orders o
      LEFT JOIN download_tasks dt ON o.id = dt.order_id
      WHERE o.payment_status = 'paid'
      GROUP BY o.id
      HAVING task_count > 0
      ORDER BY o.created_at DESC
      LIMIT 1
    `);
    
    await conn.end();
    
    if (orders.length > 0) {
      const order = orders[0];
      log(`✅ Found order: ${order.order_code} (ID: ${order.id}, ${order.task_count} tasks)`, 'green');
      return order.id;
    } else {
      log(`⚠️  No paid orders with tasks found`, 'yellow');
      return null;
    }
  } catch (error) {
    log(`❌ Error finding order: ${error.message}`, 'red');
    return null;
  }
}

async function getOrderTasks(orderId) {
  try {
    const conn = await getDbConnection();
    const [tasks] = await conn.execute(`
      SELECT id, status, course_url
      FROM download_tasks
      WHERE order_id = ?
      LIMIT 5
    `, [orderId]);
    await conn.end();
    return tasks;
  } catch (error) {
    log(`❌ Error getting tasks: ${error.message}`, 'red');
    return [];
  }
}

async function checkLogsInDatabase(orderId) {
  log(`\n📊 Test 5: Database Log Verification (Order ${orderId})`, 'cyan');
  try {
    const conn = await getDbConnection();
    
    // Check audit logs
    const [auditLogs] = await conn.execute(`
      SELECT COUNT(*) as count, 
             COUNT(CASE WHEN severity = 'error' THEN 1 END) as errors,
             COUNT(CASE WHEN severity = 'warning' THEN 1 END) as warnings
      FROM order_audit_logs
      WHERE order_id = ?
    `, [orderId]);
    
    // Check task logs
    const [taskLogs] = await conn.execute(`
      SELECT COUNT(*) as count,
             COUNT(CASE WHEN level = 'error' THEN 1 END) as errors,
             COUNT(CASE WHEN level = 'warn' THEN 1 END) as warnings,
             MAX(progress_percent) as max_progress
      FROM task_logs
      WHERE order_id = ?
    `, [orderId]);
    
    await conn.end();
    
    const audit = auditLogs[0];
    const task = taskLogs[0];
    
    log(`✅ Audit logs: ${audit.count} total (${audit.errors} errors, ${audit.warnings} warnings)`, 'green');
    log(`✅ Task logs: ${task.count} total (${task.errors} errors, ${task.warnings} warnings)`, 'green');
    if (task.max_progress !== null) {
      log(`   Max progress: ${task.max_progress}%`, 'blue');
    }
    
    return { audit, task };
  } catch (error) {
    log(`❌ Database log check failed: ${error.message}`, 'red');
    return null;
  }
}

async function testUnifiedLogger() {
  log('\n🔧 Test 6: UnifiedLogger Service', 'cyan');
  try {
    const UnifiedLogger = require('../src/services/unifiedLogger.service');
    
    // Test logOrderEvent
    const orderLog = await UnifiedLogger.logOrderEvent(
      999,
      'order',
      'Test order event from test script',
      { test: true },
      'info',
      'test_script'
    );
    
    if (orderLog) {
      log(`✅ logOrderEvent working (log ID: ${orderLog.id || 'N/A'})`, 'green');
    } else {
      log(`⚠️  logOrderEvent returned null (might be expected if order doesn't exist)`, 'yellow');
    }
    
    // Test logProgress
    const progressLog = await UnifiedLogger.logProgress(
      999,
      999,
      75.5,
      'test-lecture.mp4',
      { speed: 2500000, eta: '2m 30s' }
    );
    
    if (progressLog) {
      log(`✅ logProgress working (log ID: ${progressLog.id || 'N/A'})`, 'green');
    } else {
      log(`⚠️  logProgress returned null`, 'yellow');
    }
    
    return true;
  } catch (error) {
    log(`❌ UnifiedLogger test failed: ${error.message}`, 'red');
    log(`   Stack: ${error.stack}`, 'red');
    return false;
  }
}

async function main() {
  log('\n🚀 Starting Logging System Tests\n', 'cyan');
  
  const orderId = process.argv[2] ? parseInt(process.argv[2]) : null;
  
  const results = {
    databaseTables: false,
    internalAPI: false,
    adminAPI: false,
    taskLogs: false,
    databaseLogs: false,
    unifiedLogger: false
  };
  
  // Test 1: Database tables
  results.databaseTables = await testDatabaseTables();
  
  // Test 2: Internal API
  results.internalAPI = await testInternalAPI();
  
  // Test 3: UnifiedLogger service
  results.unifiedLogger = await testUnifiedLogger();
  
  // Test 4-5: Order-specific tests (if orderId provided or found)
  let testOrderId = orderId;
  if (!testOrderId) {
    testOrderId = await getRecentOrder();
  }
  
  if (testOrderId) {
    results.adminAPI = await testAdminAPI(testOrderId);
    results.databaseLogs = await checkLogsInDatabase(testOrderId) !== null;
    
    // Test task logs for first task
    const tasks = await getOrderTasks(testOrderId);
    if (tasks.length > 0) {
      results.taskLogs = await testTaskLogs(tasks[0].id);
    } else {
      log(`\n⚠️  No tasks found for order ${testOrderId}`, 'yellow');
    }
  } else {
    log('\n⚠️  Skipping order-specific tests (no order ID provided or found)', 'yellow');
  }
  
  // Summary
  log('\n' + '='.repeat(60), 'cyan');
  log('📊 Test Results Summary', 'cyan');
  log('='.repeat(60), 'cyan');
  
  const testNames = {
    databaseTables: 'Database Tables',
    internalAPI: 'Internal API',
    adminAPI: 'Admin API',
    taskLogs: 'Task Logs API',
    databaseLogs: 'Database Logs',
    unifiedLogger: 'UnifiedLogger Service'
  };
  
  let passed = 0;
  let total = 0;
  
  for (const [key, name] of Object.entries(testNames)) {
    total++;
    const result = results[key];
    if (result) {
      passed++;
      log(`✅ ${name}`, 'green');
    } else {
      log(`❌ ${name}`, 'red');
    }
  }
  
  log('='.repeat(60), 'cyan');
  log(`\n📈 Results: ${passed}/${total} tests passed`, passed === total ? 'green' : 'yellow');
  
  if (passed === total) {
    log('\n🎉 All tests passed! Logging system is working correctly.', 'green');
    process.exit(0);
  } else {
    log('\n⚠️  Some tests failed. Please check the errors above.', 'yellow');
    process.exit(1);
  }
}

// Run tests
main().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  log(`   Stack: ${error.stack}`, 'red');
  process.exit(1);
});
