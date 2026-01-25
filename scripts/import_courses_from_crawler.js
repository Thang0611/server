/**
 * Import courses from crawler JSON file to database
 * Usage: node scripts/import_courses_from_crawler.js
 */

// Load environment variables - use .env.development if NODE_ENV=development
const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = nodeEnv === 'development' 
    ? require('path').join(__dirname, '../.env.development')
    : require('path').join(__dirname, '../.env');
require('dotenv').config({ path: envFile });
const fs = require('fs');
const path = require('path');
const Course = require('../src/models/course.model');
const CurriculumSection = require('../src/models/curriculumSection.model');
const CurriculumLecture = require('../src/models/curriculumLecture.model');

const JSON_FILE_PATH = path.join(__dirname, '../../craw/course_info_final.json');

async function importCourses() {
  try {
    console.log('🚀 Starting course import...\n');
    
    // Check if JSON file exists
    if (!fs.existsSync(JSON_FILE_PATH)) {
      console.error(`❌ JSON file not found: ${JSON_FILE_PATH}`);
      process.exit(1);
    }
    
    // Read JSON file
    console.log(`📖 Reading JSON file: ${JSON_FILE_PATH}`);
    const jsonContent = fs.readFileSync(JSON_FILE_PATH, 'utf8');
    const coursesData = JSON.parse(jsonContent);
    
    // Handle both array and single object
    let coursesArray;
    if (Array.isArray(coursesData)) {
      coursesArray = coursesData;
    } else if (coursesData && typeof coursesData === 'object') {
      // Check if it's an object with course data (has url or course_url)
      if (coursesData.url || coursesData.course_url) {
        // Single course object
        coursesArray = [coursesData];
      } else {
        // Might be an object containing an array, try common keys
        coursesArray = coursesData.courses || coursesData.items || [coursesData];
      }
    } else {
      coursesArray = [];
    }
    
    console.log(`📊 Found ${coursesArray.length} courses to import\n`);
    
    let imported = 0;
    let updated = 0;
    let failed = 0;
    const errors = [];
    
    // Import each course
    for (let i = 0; i < coursesArray.length; i++) {
      const course = coursesArray[i];
      
      try {
        // Extract data with fallbacks
        const courseData = {
          course_url: course.url || course.course_url || null,
          title: course.title || 'Untitled Course',
          thumbnail: course.thumbnail || null,
          instructor: course.instructor?.name || course.instructor || null,
          rating: course.rating?.score || course.rating || null,
          students: course.students || course.rating?.count || null,
          duration: course.content?.video_hours || course.content?.duration || null,
          lectures: course.content?.lectures || course.content?.lecture_count || null,
          category: course.metadata?.category || course.category || null,
          platform: 'Udemy', // Default to Udemy
          description: course.description?.short || course.description || null,
          price: 50000, // Default price
          original_price: null,
          bestseller: course.bestseller || false,
          drive_link: null, // Will be synced from download_tasks later
          status: 'active',
          // Curriculum summary fields
          total_sections: course.curriculum?.total_sections || null,
          total_lectures: course.curriculum?.total_lectures || null,
          total_duration_seconds: course.curriculum?.total_duration_seconds || null
        };
        
        // Skip if no URL
        if (!courseData.course_url) {
          console.log(`⚠️  [${i + 1}/${coursesArray.length}] Skipping: No URL`);
          failed++;
          continue;
        }
        
        // Use upsert to avoid duplicates
        const [courseRecord, created] = await Course.upsert(courseData, {
          returning: true
        });
        
        if (created) {
          imported++;
          console.log(`✅ [${i + 1}/${coursesArray.length}] Imported: ${courseData.title.substring(0, 50)}...`);
        } else {
          updated++;
          console.log(`🔄 [${i + 1}/${coursesArray.length}] Updated: ${courseData.title.substring(0, 50)}...`);
        }
        
        // Import curriculum (sections and lectures)
        if (course.curriculum && course.curriculum.sections && Array.isArray(course.curriculum.sections)) {
          try {
            // Get existing sections for this course
            const existingSections = await CurriculumSection.findAll({
              where: { course_id: courseRecord.id }
            });
            
            // Delete lectures first (due to foreign key constraint)
            for (const section of existingSections) {
              await CurriculumLecture.destroy({
                where: { section_id: section.id }
              });
            }
            
            // Then delete sections
            await CurriculumSection.destroy({
              where: { course_id: courseRecord.id }
            });
            
            let sectionsImported = 0;
            let lecturesImported = 0;
            
            // Import sections and lectures
            for (const sectionData of course.curriculum.sections) {
              const sectionRecord = await CurriculumSection.create({
                course_id: courseRecord.id,
                section_id: sectionData.id || null,
                section_index: sectionData.index || sectionData.section_index || 0,
                title: sectionData.title || 'Untitled Section',
                lecture_count: sectionData.lecture_count || (sectionData.lectures ? sectionData.lectures.length : 0),
                duration_seconds: sectionData.duration_seconds || 0
              });
              
              sectionsImported++;
              
              // Import lectures for this section
              if (sectionData.lectures && Array.isArray(sectionData.lectures)) {
                for (const lectureData of sectionData.lectures) {
                  await CurriculumLecture.create({
                    section_id: sectionRecord.id,
                    lecture_id: lectureData.id || null,
                    lecture_index: lectureData.index || lectureData.lecture_index || 0,
                    title: lectureData.title || 'Untitled Lecture',
                    type: lectureData.type || 'VIDEO_LECTURE',
                    duration_seconds: lectureData.duration_seconds || 0,
                    is_previewable: lectureData.is_previewable || false
                  });
                  
                  lecturesImported++;
                }
              }
            }
            
            console.log(`   📚 Curriculum: ${sectionsImported} sections, ${lecturesImported} lectures`);
          } catch (curriculumError) {
            console.error(`   ⚠️  Curriculum import error: ${curriculumError.message}`);
            // Don't fail the whole import if curriculum fails
          }
        }
        
      } catch (error) {
        failed++;
        const errorMsg = `Failed to import: ${course.title || 'Unknown'}`;
        errors.push({ course: course.title || 'Unknown', error: error.message });
        console.error(`❌ [${i + 1}/${coursesArray.length}] ${errorMsg}`);
        console.error(`   Error: ${error.message}`);
      }
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 IMPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Imported: ${imported}`);
    console.log(`🔄 Updated: ${updated}`);
    console.log(`❌ Failed: ${failed}`);
    
    if (errors.length > 0) {
      console.log('\n⚠️  Errors:');
      errors.slice(0, 10).forEach(e => {
        console.log(`   - ${e.course}: ${e.error}`);
      });
      if (errors.length > 10) {
        console.log(`   ... and ${errors.length - 10} more errors`);
      }
    }
    
    console.log('\n✅ Import completed!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run import
importCourses();
