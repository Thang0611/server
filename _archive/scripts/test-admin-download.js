/**
 * Test script for admin course download functionality
 * Tests the download flow for permanent courses
 */

const axios = require('axios');
const FormData = require('form-data');

const API_URL = process.env.API_URL || 'http://localhost:3001';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'getcourses.net@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'your-password';

// Test course data
const testCourse = {
  title: 'Test Course for Admin Download',
  course_url: 'https://www.udemy.com/course/the-complete-web-development-bootcamp/',
  platform: 'udemy',
  category: 'Development',
  instructor: 'Test Instructor',
  rating: 4.5,
  students: 1000,
  status: 'active'
};

async function login() {
  try {
    console.log('🔐 Logging in as admin...');
    const response = await axios.post(`${API_URL}/api/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });

    if (response.data.success && response.data.token) {
      console.log('✅ Login successful');
      return response.data.token;
    } else {
      throw new Error('Login failed: No token received');
    }
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    throw error;
  }
}

async function createTestCourse(token) {
  try {
    console.log('📝 Creating test course...');
    const response = await axios.post(
      `${API_URL}/api/admin/courses`,
      testCourse,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.success && response.data.data) {
      console.log('✅ Test course created:', response.data.data.id);
      return response.data.data;
    } else {
      throw new Error('Failed to create test course');
    }
  } catch (error) {
    console.error('❌ Failed to create test course:', error.response?.data || error.message);
    throw error;
  }
}

async function triggerDownload(token, courseId) {
  try {
    console.log(`🚀 Triggering download for course ${courseId}...`);
    const response = await axios.post(
      `${API_URL}/api/admin/courses/${courseId}/download`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.success) {
      console.log('✅ Download triggered successfully');
      console.log('   Task ID:', response.data.data.taskId);
      return response.data.data;
    } else {
      throw new Error('Failed to trigger download');
    }
  } catch (error) {
    console.error('❌ Failed to trigger download:', error.response?.data || error.message);
    if (error.response?.data?.error) {
      console.error('   Error details:', error.response.data.error);
    }
    throw error;
  }
}

async function checkTaskStatus(token, taskId) {
  try {
    console.log(`📊 Checking task status for task ${taskId}...`);
    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Note: You may need to implement an endpoint to check task status
    // For now, we'll just log that we're checking
    console.log('   Task status check would go here');
  } catch (error) {
    console.error('❌ Failed to check task status:', error.message);
  }
}

async function cleanup(token, courseId) {
  try {
    console.log(`🧹 Cleaning up test course ${courseId}...`);
    await axios.delete(
      `${API_URL}/api/admin/courses?id=${courseId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    console.log('✅ Test course deleted');
  } catch (error) {
    console.warn('⚠️  Failed to cleanup test course:', error.response?.data || error.message);
  }
}

async function main() {
  let token = null;
  let courseId = null;
  let taskId = null;

  try {
    // Step 1: Login
    token = await login();

    // Step 2: Create test course
    const course = await createTestCourse(token);
    courseId = course.id;

    // Step 3: Trigger download
    const downloadResult = await triggerDownload(token, courseId);
    taskId = downloadResult.taskId;

    // Step 4: Check task status
    await checkTaskStatus(token, taskId);

    console.log('\n✅ Test completed successfully!');
    console.log(`   Course ID: ${courseId}`);
    console.log(`   Task ID: ${taskId}`);
    console.log('\n💡 Check the logs to verify the download process');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    // Cleanup (optional - comment out if you want to keep the test course)
    // if (token && courseId) {
    //   await cleanup(token, courseId);
    // }
  }
}

// Run the test
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main };
