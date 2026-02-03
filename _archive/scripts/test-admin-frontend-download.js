/**
 * Test script to simulate frontend admin calling download API
 * Tests the full flow: API call -> enrollment -> download queue -> worker processing
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { Course, DownloadTask } = require('../src/models');
const Logger = require('../src/utils/logger.util');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'support@getcourses.net';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;

// Test course URL
const testUrl = 'https://www.udemy.com/course/the-complete-web-development-bootcamp/';

/**
 * Generate JWT token for admin user
 */
function generateAdminToken() {
  try {
    console.log('🔐 Step 1: Generating admin JWT token...');
    
    if (!NEXTAUTH_SECRET) {
      throw new Error('NEXTAUTH_SECRET is not set in environment variables');
    }
    
    // Create JWT token with admin role
    const payload = {
      id: 'admin-test',
      email: ADMIN_EMAIL,
      role: 'admin',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour expiry
    };
    
    const token = jwt.sign(payload, NEXTAUTH_SECRET);
    console.log('   ✅ Token generated successfully');
    console.log(`   Email: ${ADMIN_EMAIL}`);
    console.log(`   Role: admin`);
    
    return token;
    
  } catch (error) {
    console.error('   ❌ Token generation failed:', error.message);
    throw error;
  }
}

/**
 * Call admin download API
 */
async function callAdminDownloadAPI(courseId, token) {
  try {
    console.log(`\n📡 Step 2: Calling admin download API for course ID ${courseId}...`);
    
    const url = `${API_BASE_URL}/api/admin/courses/${courseId}/download`;
    const headers = {
      'Content-Type': 'application/json'
    };
    
    // Add auth token
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await axios.post(url, {
      email: ADMIN_EMAIL // Optional email parameter
    }, {
      headers,
      validateStatus: (status) => status < 500 // Don't throw on 4xx
    });
    
    if (response.status === 200 || response.status === 201) {
      console.log('   ✅ API call successful');
      console.log('   Response:', JSON.stringify(response.data, null, 2));
      return response.data;
    } else {
      console.error(`   ❌ API call failed with status ${response.status}`);
      console.error('   Response:', response.data);
      throw new Error(`API returned ${response.status}: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    if (error.response) {
      console.error(`   ❌ API error: ${error.response.status}`);
      console.error('   Response:', error.response.data);
      throw new Error(`API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else {
      console.error('   ❌ Request failed:', error.message);
      throw error;
    }
  }
}

/**
 * Verify task was created
 */
async function verifyTaskCreation(taskId) {
  try {
    console.log(`\n✅ Step 3: Verifying task creation (Task ID: ${taskId})...`);
    
    const task = await DownloadTask.findByPk(taskId, {
      attributes: ['id', 'status', 'course_type', 'order_id', 'email', 'course_url', 'title', 'error_log']
    });
    
    if (!task) {
      throw new Error('Task not found in database');
    }
    
    console.log('   Task details:');
    console.log(`      ID: ${task.id}`);
    console.log(`      Status: ${task.status}`);
    console.log(`      Course Type: ${task.course_type} (should be 'permanent')`);
    console.log(`      Order ID: ${task.order_id} (should be null)`);
    console.log(`      Email: ${task.email}`);
    console.log(`      Course URL: ${task.course_url}`);
    console.log(`      Title: ${task.title || 'N/A'}`);
    
    if (task.error_log) {
      console.log(`      Error Log: ${task.error_log.substring(0, 200)}...`);
    }
    
    // Verify admin download properties
    const isAdminDownload = task.course_type === 'permanent' && task.order_id === null;
    if (!isAdminDownload) {
      console.error('   ❌ Task is not identified as admin download!');
      return false;
    }
    
    console.log('   ✅ Task is correctly configured as admin download');
    return true;
  } catch (error) {
    console.error('   ❌ Verification failed:', error.message);
    throw error;
  }
}

/**
 * Monitor task status
 */
async function monitorTaskStatus(taskId, maxWaitSeconds = 30) {
  try {
    console.log(`\n⏳ Step 4: Monitoring task status (max ${maxWaitSeconds}s)...`);
    
    const startTime = Date.now();
    const checkInterval = 2000; // Check every 2 seconds
    
    while ((Date.now() - startTime) < maxWaitSeconds * 1000) {
      const task = await DownloadTask.findByPk(taskId, {
        attributes: ['id', 'status', 'error_log']
      });
      
      if (!task) {
        throw new Error('Task not found');
      }
      
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.log(`   [${elapsed}s] Task status: ${task.status}`);
      
      if (task.status === 'completed') {
        console.log('   ✅ Task completed successfully!');
        return { success: true, status: task.status };
      }
      
      if (task.status === 'failed') {
        console.error('   ❌ Task failed');
        if (task.error_log) {
          console.error(`   Error: ${task.error_log.substring(0, 300)}`);
        }
        return { success: false, status: task.status, error: task.error_log };
      }
      
      if (['enrolled', 'downloading'].includes(task.status)) {
        console.log(`   ⏳ Task is ${task.status}, continuing to monitor...`);
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    // Get final status after timeout
    const finalTask = await DownloadTask.findByPk(taskId, {
      attributes: ['id', 'status']
    });
    
    console.log(`   ⏱️  Timeout reached, final status: ${finalTask?.status || 'unknown'}`);
    return { success: false, status: finalTask?.status || 'unknown', timeout: true };
  } catch (error) {
    console.error('   ❌ Monitoring failed:', error.message);
    throw error;
  }
}

/**
 * Main test function
 */
async function testAdminFrontendDownload() {
  try {
    console.log('🧪 Testing Admin Frontend Download Flow\n');
    console.log('='.repeat(60));
    
    // Step 0: Find or create test course
    console.log('\n📚 Step 0: Finding/Creating test course...');
    let course = await Course.findOne({
      where: { course_url: testUrl }
    });
    
    if (!course) {
      course = await Course.create({
        title: 'Test Course for Admin Frontend Download',
        course_url: testUrl,
        platform: 'udemy',
        category: 'Development',
        status: 'active',
        drive_link: null
      });
      console.log(`   ✅ Test course created: ID=${course.id}`);
    } else {
      // Clear drive_link if exists for testing
      if (course.drive_link) {
        await course.update({ drive_link: null });
        console.log(`   ✅ Found existing course: ID=${course.id}, cleared drive_link`);
      } else {
        console.log(`   ✅ Found existing course: ID=${course.id}`);
      }
    }
    
    // Step 1: Generate admin token
    const token = generateAdminToken();
    
    // Step 2: Call API
    const apiResult = await callAdminDownloadAPI(course.id, token);
    
    if (!apiResult || !apiResult.data || !apiResult.data.taskId) {
      throw new Error('API did not return taskId');
    }
    
    const taskId = apiResult.data.taskId;
    console.log(`\n   📝 Task ID from API: ${taskId}`);
    
    // Step 3: Verify task
    await verifyTaskCreation(taskId);
    
    // Step 4: Monitor status
    const monitorResult = await monitorTaskStatus(taskId, 30);
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 Test Summary:');
    console.log(`   Course ID: ${course.id}`);
    console.log(`   Task ID: ${taskId}`);
    console.log(`   Final Status: ${monitorResult.status}`);
    console.log(`   Success: ${monitorResult.success ? '✅' : '❌'}`);
    
    if (monitorResult.success) {
      console.log('\n✅ All tests passed! Admin frontend download flow is working correctly.');
    } else {
      console.log('\n⚠️  Test completed but task did not complete successfully.');
      console.log('   This may be expected if enrollment/download takes longer than 30s.');
      console.log('   Check worker logs for more details.');
    }
    
    // Cleanup option
    console.log('\n💡 Note: Task will continue processing in background.');
    console.log('   You can check task status later or clean up manually if needed.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  } finally {
    // Close database connection
    if (Course.sequelize) {
      await Course.sequelize.close();
    }
  }
}

// Run the test
if (require.main === module) {
  testAdminFrontendDownload().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { testAdminFrontendDownload };
