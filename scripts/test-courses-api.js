/**
 * Test Courses API
 * Usage: node scripts/test-courses-api.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

// Colors
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

async function testCoursesAPI() {
  try {
    log('\n🧪 Testing Courses API\n', 'cyan');
    
    // Test 1: Get all courses
    log('Test 1: GET /api/courses', 'blue');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/courses`);
      if (response.data.success) {
        log(`✅ Success: Found ${response.data.courses.length} courses`, 'green');
        log(`   Total: ${response.data.pagination.total}`, 'green');
        log(`   Page: ${response.data.pagination.page}/${response.data.pagination.totalPages}`, 'green');
      } else {
        log('❌ API returned success: false', 'red');
      }
    } catch (error) {
      log(`❌ Error: ${error.message}`, 'red');
      if (error.response) {
        log(`   Status: ${error.response.status}`, 'red');
        log(`   Data: ${JSON.stringify(error.response.data)}`, 'red');
      }
    }
    
    // Test 2: Get categories
    log('\nTest 2: GET /api/courses/categories', 'blue');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/courses/categories`);
      if (response.data.success) {
        log(`✅ Success: Found ${response.data.categories.length} categories`, 'green');
        if (response.data.categories.length > 0) {
          log(`   Categories: ${response.data.categories.slice(0, 5).join(', ')}${response.data.categories.length > 5 ? '...' : ''}`, 'green');
        }
      }
    } catch (error) {
      log(`❌ Error: ${error.message}`, 'red');
    }
    
    // Test 3: Get platforms
    log('\nTest 3: GET /api/courses/platforms', 'blue');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/courses/platforms`);
      if (response.data.success) {
        log(`✅ Success: Found ${response.data.platforms.length} platforms`, 'green');
        if (response.data.platforms.length > 0) {
          log(`   Platforms: ${response.data.platforms.join(', ')}`, 'green');
        }
      }
    } catch (error) {
      log(`❌ Error: ${error.message}`, 'red');
    }
    
    // Test 4: Filter by category
    log('\nTest 4: GET /api/courses?category=Lập trình', 'blue');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/courses?category=Lập trình`);
      if (response.data.success) {
        log(`✅ Success: Found ${response.data.courses.length} courses in category "Lập trình"`, 'green');
      }
    } catch (error) {
      log(`❌ Error: ${error.message}`, 'red');
    }
    
    // Test 5: Search
    log('\nTest 5: GET /api/courses?search=python', 'blue');
    try {
      const response = await axios.get(`${API_BASE_URL}/api/courses?search=python`);
      if (response.data.success) {
        log(`✅ Success: Found ${response.data.courses.length} courses matching "python"`, 'green');
      }
    } catch (error) {
      log(`❌ Error: ${error.message}`, 'red');
    }
    
    log('\n✅ All API tests completed!\n', 'green');
    
  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

testCoursesAPI();
