/**
 * Test script for curriculum API endpoints
 * Usage: node scripts/test-curriculum-api.js [course_id]
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const COURSE_ID = process.argv[2] ? parseInt(process.argv[2]) : null;

async function testCurriculumAPI() {
  console.log('🧪 Testing Curriculum API\n');
  console.log(`API Base URL: ${API_BASE_URL}\n`);
  
  try {
    // Test 1: Get course detail with curriculum
    if (COURSE_ID) {
      console.log('='.repeat(60));
      console.log('Test 1: GET /api/courses/:id (with curriculum)');
      console.log('='.repeat(60));
      
      const response1 = await axios.get(`${API_BASE_URL}/api/courses/${COURSE_ID}`);
      
      if (response1.data.success) {
        const course = response1.data.course;
        console.log(`✅ Course found: ${course.title}`);
        console.log(`   ID: ${course.id}`);
        console.log(`   Total sections: ${course.total_sections || 0}`);
        console.log(`   Total lectures: ${course.total_lectures || 0}`);
        console.log(`   Total duration: ${course.total_duration_seconds || 0} seconds`);
        
        if (course.sections && course.sections.length > 0) {
          console.log(`\n   Sections: ${course.sections.length}`);
          course.sections.slice(0, 3).forEach((section, idx) => {
            console.log(`   ${idx + 1}. ${section.title} (${section.lecture_count} lectures)`);
            if (section.lectures && section.lectures.length > 0) {
              console.log(`      - First lecture: ${section.lectures[0].title}`);
            }
          });
          if (course.sections.length > 3) {
            console.log(`   ... and ${course.sections.length - 3} more sections`);
          }
        } else {
          console.log('   ⚠️  No curriculum data found');
        }
      } else {
        console.log(`❌ Failed: ${response1.data.error}`);
      }
      
      console.log('\n');
    }
    
    // Test 2: Get curriculum endpoint
    if (COURSE_ID) {
      console.log('='.repeat(60));
      console.log('Test 2: GET /api/courses/:id/curriculum');
      console.log('='.repeat(60));
      
      const response2 = await axios.get(`${API_BASE_URL}/api/courses/${COURSE_ID}/curriculum`);
      
      if (response2.data.success) {
        const curriculum = response2.data.curriculum;
        console.log(`✅ Curriculum retrieved`);
        console.log(`   Total sections: ${curriculum.total_sections}`);
        console.log(`   Total lectures: ${curriculum.total_lectures}`);
        console.log(`   Total duration: ${curriculum.total_duration_seconds} seconds`);
        console.log(`   Sections count: ${curriculum.sections.length}`);
        
        if (curriculum.sections.length > 0) {
          const firstSection = curriculum.sections[0];
          console.log(`\n   First section: ${firstSection.title}`);
          console.log(`   - Lectures: ${firstSection.lectures.length}`);
          if (firstSection.lectures.length > 0) {
            console.log(`   - First lecture: ${firstSection.lectures[0].title} (${firstSection.lectures[0].type})`);
          }
        }
      } else {
        console.log(`❌ Failed: ${response2.data.error}`);
      }
      
      console.log('\n');
    }
    
    // Test 3: List courses (to find a course with curriculum)
    console.log('='.repeat(60));
    console.log('Test 3: GET /api/courses (list courses)');
    console.log('='.repeat(60));
    
    const response3 = await axios.get(`${API_BASE_URL}/api/courses`, {
      params: { limit: 5 }
    });
    
    if (response3.data.success) {
      const courses = response3.data.courses;
      console.log(`✅ Found ${courses.length} courses`);
      
      courses.forEach((course, idx) => {
        console.log(`\n   ${idx + 1}. ${course.title}`);
        console.log(`      ID: ${course.id}`);
        console.log(`      Sections: ${course.total_sections || 'N/A'}`);
        console.log(`      Lectures: ${course.total_lectures || 'N/A'}`);
        console.log(`      Duration: ${course.total_duration_seconds ? Math.round(course.total_duration_seconds / 3600 * 10) / 10 + ' hours' : 'N/A'}`);
      });
      
      if (!COURSE_ID && courses.length > 0) {
        console.log(`\n💡 Tip: Run with course ID to test curriculum endpoints:`);
        console.log(`   node scripts/test-curriculum-api.js ${courses[0].id}`);
      }
    } else {
      console.log(`❌ Failed: ${response3.data.error}`);
    }
    
    console.log('\n');
    console.log('='.repeat(60));
    console.log('✅ All tests completed!');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

testCurriculumAPI();
