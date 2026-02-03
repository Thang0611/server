#!/usr/bin/env node

/**
 * Test Suite - Error Cases Analysis
 * Test tất cả các trường hợp gây lỗi từ LOG_ANALYSIS_2026-01-13
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
  test: (msg) => console.log(`${colors.magenta}TEST: ${msg}${colors.reset}`),
  result: (msg) => console.log(`${colors.cyan}→ ${msg}${colors.reset}`),
};

// Test results
const results = {
  passed: [],
  failed: [],
  warnings: [],
};

async function getDbConnection() {
  try {
    const envPath = path.join(__dirname, '../.env');
    if (!fs.existsSync(envPath)) {
      throw new Error('.env file not found');
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const dbName = envContent.match(/DB_NAME=(.+)/)?.[1] || 'udemy_downloader';
    const dbUser = envContent.match(/DB_USER=(.+)/)?.[1] || 'root';
    const dbPass = envContent.match(/DB_PASSWORD=(.+)/)?.[1] || '';
    const dbHost = envContent.match(/DB_HOST=(.+)/)?.[1] || 'localhost';
    
    return await mysql.createConnection({
      host: dbHost,
      user: dbUser,
      password: dbPass,
      database: dbName,
    });
  } catch (error) {
    log.warning(`Cannot connect to database: ${error.message}`);
    return null;
  }
}

// ========================================
// TEST 1: Database Schema Check
// ========================================
async function testDatabaseSchema() {
  log.test('TEST 1: Checking Database Schema');
  
  const conn = await getDbConnection();
  if (!conn) {
    results.warnings.push('Database connection failed - skipping schema tests');
    log.warning('Skipping database tests');
    return;
  }
  
  try {
    // Test 1.1: Check if driver_url column exists
    log.info('Checking for driver_url column in download_tasks...');
    const [columns] = await conn.query(
      "SHOW COLUMNS FROM download_tasks WHERE Field = 'driver_url'"
    );
    
    if (columns.length === 0) {
      results.failed.push('driver_url column is missing');
      log.error('driver_url column NOT FOUND in download_tasks table');
    } else {
      results.passed.push('driver_url column exists');
      log.success('driver_url column exists');
    }
    
    // Test 1.2: Check foreign key constraints
    log.info('Checking foreign key constraints...');
    const [constraints] = await conn.query(
      `SELECT CONSTRAINT_NAME 
       FROM information_schema.TABLE_CONSTRAINTS 
       WHERE TABLE_NAME = 'download_tasks' 
       AND CONSTRAINT_TYPE = 'FOREIGN KEY'`
    );
    
    log.result(`Found ${constraints.length} foreign key(s)`);
    constraints.forEach(c => {
      log.result(`  - ${c.CONSTRAINT_NAME}`);
    });
    
    if (constraints.length > 0) {
      results.passed.push('Foreign keys exist');
      log.success('Foreign key constraints are present');
    } else {
      results.warnings.push('No foreign keys found');
      log.warning('No foreign key constraints found');
    }
    
    // Test 1.3: Check Task 28 status
    log.info('Checking Task 28 status in database...');
    const [task28] = await conn.query(
      'SELECT id, order_id, course_url, email, status, error_message FROM download_tasks WHERE id = 28'
    );
    
    if (task28.length > 0) {
      const task = task28[0];
      log.result(`Task 28 found:`);
      log.result(`  - Status: ${task.status}`);
      log.result(`  - Email: ${task.email}`);
      log.result(`  - Course: ${task.course_url?.substring(0, 50)}...`);
      log.result(`  - Error: ${task.error_message || 'None'}`);
      
      if (task.status === 'failed') {
        results.warnings.push('Task 28 is in failed state');
        log.warning('Task 28 status is FAILED');
      }
    } else {
      log.warning('Task 28 not found in database');
    }
    
  } catch (error) {
    results.failed.push(`Database test error: ${error.message}`);
    log.error(`Database test failed: ${error.message}`);
  } finally {
    await conn.end();
  }
}

// ========================================
// TEST 2: Udemy Session Check
// ========================================
async function testUdemySession() {
  log.test('TEST 2: Checking Udemy Session/Cookies');
  
  const savedDir = path.join(__dirname, '../udemy_dl/saved');
  
  // Check if saved directory exists
  if (!fs.existsSync(savedDir)) {
    results.failed.push('Saved session directory not found');
    log.error(`Saved directory not found: ${savedDir}`);
    return;
  }
  
  // Check for cookie files
  log.info('Checking for session files...');
  const files = fs.readdirSync(savedDir);
  const cookieFiles = files.filter(f => f.includes('cookie') || f.includes('session'));
  
  if (cookieFiles.length === 0) {
    results.failed.push('No session/cookie files found');
    log.error('No session or cookie files found');
    log.result('Account needs to login again!');
  } else {
    log.success(`Found ${cookieFiles.length} session file(s)`);
    cookieFiles.forEach(f => {
      const filePath = path.join(savedDir, f);
      const stats = fs.statSync(filePath);
      const age = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60); // hours
      
      log.result(`  - ${f} (${age.toFixed(1)} hours old)`);
      
      if (age > 24) {
        results.warnings.push(`Session file ${f} is ${age.toFixed(0)} hours old`);
        log.warning(`    → Session might be expired (>24h old)`);
      }
    });
    results.passed.push('Session files exist');
  }
  
  // Check .env file in udemy_dl
  const envPath = path.join(__dirname, '../udemy_dl/.env');
  log.info('Checking udemy_dl/.env file...');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    if (envContent.trim().length === 0) {
      results.warnings.push('udemy_dl/.env is empty');
      log.warning('.env file is empty');
    } else {
      results.passed.push('.env file exists and has content');
      log.success('.env file exists');
    }
  } else {
    results.warnings.push('udemy_dl/.env not found');
    log.warning('.env file not found');
  }
}

// ========================================
// TEST 3: Course Enrollment Check
// ========================================
async function testCourseEnrollment() {
  log.test('TEST 3: Testing Course Enrollment');
  
  const testCases = [
    {
      name: 'Task 28 Course (Failed)',
      url: 'https://samsungu.udemy.com/course/tu-ong-hoa-cong-viec-bang-ai-agent-va-n8n/',
    },
    {
      name: 'Invalid Course',
      url: 'https://samsungu.udemy.com/course/this-course-does-not-exist-12345/',
    },
  ];
  
  for (const testCase of testCases) {
    log.info(`Testing: ${testCase.name}`);
    log.result(`URL: ${testCase.url}`);
    
    try {
      const cmd = `cd /root/server/udemy_dl && timeout 15 python3 main.py -c "${testCase.url}" --list-lectures 2>&1 | head -20`;
      const output = execSync(cmd, { encoding: 'utf8' });
      
      if (output.includes('Failed to find the course')) {
        results.warnings.push(`Not enrolled: ${testCase.name}`);
        log.error('NOT ENROLLED in this course');
        log.result('Reason: "Failed to find the course, are you enrolled?"');
      } else if (output.includes('Chapter') || output.includes('Lecture')) {
        results.passed.push(`Enrolled: ${testCase.name}`);
        log.success('Course is accessible (enrolled)');
      } else if (output.includes('Visit request successful')) {
        results.warnings.push(`Partial success: ${testCase.name}`);
        log.warning('Visit successful but course data unclear');
      } else {
        log.result('Output unclear, check manually');
      }
    } catch (error) {
      results.failed.push(`Enrollment test failed: ${testCase.name}`);
      log.error(`Test failed: ${error.message}`);
    }
  }
}

// ========================================
// TEST 4: Download Directory Check
// ========================================
async function testDownloadDirectories() {
  log.test('TEST 4: Checking Download Directories');
  
  const stagingDir = path.join(__dirname, '../udemy_dl/Staging_Download');
  
  if (!fs.existsSync(stagingDir)) {
    results.failed.push('Staging_Download directory not found');
    log.error('Staging_Download directory not found');
    return;
  }
  
  log.info('Checking task directories...');
  const taskDirs = fs.readdirSync(stagingDir).filter(d => d.startsWith('Task_'));
  
  log.result(`Found ${taskDirs.length} task directory(ies)`);
  
  taskDirs.forEach(dir => {
    const dirPath = path.join(stagingDir, dir);
    const files = fs.readdirSync(dirPath);
    const stats = fs.statSync(dirPath);
    const age = (Date.now() - stats.mtime.getTime()) / (1000 * 60); // minutes
    
    log.result(`  - ${dir}: ${files.length} files (${age.toFixed(0)}m ago)`);
    
    if (files.length === 0) {
      results.warnings.push(`${dir} is empty (download failed)`);
      log.warning(`    → Empty directory (download failed)`);
    }
  });
  
  results.passed.push('Task directories accessible');
}

// ========================================
// TEST 5: Worker Status Check
// ========================================
async function testWorkerStatus() {
  log.test('TEST 5: Checking Worker Status');
  
  try {
    log.info('Checking PM2 worker processes...');
    const output = execSync('pm2 jlist', { encoding: 'utf8' });
    const processes = JSON.parse(output);
    
    const workers = processes.filter(p => p.name === 'worker');
    
    log.result(`Found ${workers.length} worker process(es)`);
    
    workers.forEach(w => {
      const status = w.pm2_env.status;
      const uptime = w.pm2_env.pm_uptime;
      const restarts = w.pm2_env.restart_time;
      
      log.result(`  - Worker instance ${w.pm2_env.instance_id}:`);
      log.result(`    Status: ${status}`);
      log.result(`    Uptime: ${new Date(uptime).toLocaleString()}`);
      log.result(`    Restarts: ${restarts}`);
      
      if (status === 'online') {
        results.passed.push(`Worker ${w.pm2_env.instance_id} is online`);
      } else {
        results.failed.push(`Worker ${w.pm2_env.instance_id} is ${status}`);
        log.error(`    → Status is ${status}, not online`);
      }
    });
    
  } catch (error) {
    results.failed.push('PM2 check failed');
    log.error(`Cannot check PM2: ${error.message}`);
  }
}

// ========================================
// TEST 6: Redis Queue Check
// ========================================
async function testRedisQueue() {
  log.test('TEST 6: Checking Redis Queue');
  
  try {
    log.info('Checking Redis connection...');
    const redisCheck = execSync('redis-cli ping', { encoding: 'utf8' }).trim();
    
    if (redisCheck === 'PONG') {
      results.passed.push('Redis is responding');
      log.success('Redis is online');
      
      // Check queue length
      const queueLen = execSync('redis-cli LLEN rq:queue:downloads', { encoding: 'utf8' }).trim();
      log.result(`Queue length: ${queueLen} job(s) pending`);
      
      if (parseInt(queueLen) > 0) {
        results.warnings.push(`${queueLen} jobs in queue`);
        log.warning(`There are ${queueLen} pending jobs`);
      }
    } else {
      results.failed.push('Redis not responding correctly');
      log.error('Redis not responding');
    }
    
  } catch (error) {
    results.failed.push('Redis check failed');
    log.error(`Redis check failed: ${error.message}`);
  }
}

// ========================================
// TEST 7: Log Files Check
// ========================================
async function testLogFiles() {
  log.test('TEST 7: Checking Log Files for Recent Errors');
  
  const logDir = path.join(__dirname, '../logs');
  const errorLogFile = path.join(logDir, 'backend-error.log');
  
  if (!fs.existsSync(errorLogFile)) {
    results.warnings.push('backend-error.log not found');
    log.warning('Error log file not found');
    return;
  }
  
  log.info('Analyzing backend-error.log...');
  const errorLog = fs.readFileSync(errorLogFile, 'utf8');
  const lines = errorLog.split('\n');
  
  // Get today's errors
  const today = new Date().toISOString().split('T')[0];
  const todayErrors = lines.filter(line => line.includes(today) && line.includes('ERROR'));
  
  log.result(`Found ${todayErrors.length} error(s) today`);
  
  if (todayErrors.length > 0) {
    results.warnings.push(`${todayErrors.length} errors found today`);
    log.warning(`Recent errors detected`);
    todayErrors.slice(0, 3).forEach(err => {
      log.result(`  ${err.substring(0, 100)}...`);
    });
  } else {
    results.passed.push('No errors in logs today');
    log.success('No errors found in today\'s logs');
  }
}

// ========================================
// MAIN TEST RUNNER
// ========================================
async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 ERROR CASE TEST SUITE - LOG ANALYSIS 2026-01-13');
  console.log('='.repeat(60) + '\n');
  
  const tests = [
    testDatabaseSchema,
    testUdemySession,
    testCourseEnrollment,
    testDownloadDirectories,
    testWorkerStatus,
    testRedisQueue,
    testLogFiles,
  ];
  
  for (const test of tests) {
    try {
      await test();
      console.log(''); // spacing
    } catch (error) {
      log.error(`Test runner error: ${error.message}`);
      console.log(''); // spacing
    }
  }
  
  // Print Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60) + '\n');
  
  log.success(`PASSED: ${results.passed.length} test(s)`);
  results.passed.forEach(r => console.log(`  ✓ ${r}`));
  
  console.log('');
  
  log.error(`FAILED: ${results.failed.length} test(s)`);
  results.failed.forEach(r => console.log(`  ✗ ${r}`));
  
  console.log('');
  
  log.warning(`WARNINGS: ${results.warnings.length} item(s)`);
  results.warnings.forEach(r => console.log(`  ⚠ ${r}`));
  
  console.log('\n' + '='.repeat(60));
  
  // Exit code
  const exitCode = results.failed.length > 0 ? 1 : 0;
  process.exit(exitCode);
}

// Run tests
runAllTests().catch(error => {
  log.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
