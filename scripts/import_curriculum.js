/**
 * Import curriculum from course JSON to database
 * Usage: node scripts/import_curriculum.js [course_id]
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
// Import from index to ensure associations are loaded
const { Course, CurriculumSection, CurriculumLecture } = require('../src/models');

const JSON_FILE_PATH = path.join(__dirname, '../../craw/course_info_final.json');

async function importCurriculum(courseId = null) {
  try {
    console.log('🚀 Starting curriculum import...\n');
    
    // Read JSON file
    if (!fs.existsSync(JSON_FILE_PATH)) {
      console.error(`❌ JSON file not found: ${JSON_FILE_PATH}`);
      process.exit(1);
    }
    
    const jsonContent = fs.readFileSync(JSON_FILE_PATH, 'utf8');
    const courseData = JSON.parse(jsonContent);
    
    // Find course by URL or ID
    let course;
    if (courseId) {
      course = await Course.findByPk(courseId);
    } else {
      // Find by URL
      const courseUrl = courseData.url || courseData.course_url;
      course = await Course.findOne({ where: { course_url: courseUrl } });
    }
    
    if (!course) {
      console.error('❌ Course not found in database. Please import course first.');
      process.exit(1);
    }
    
    console.log(`📖 Found course: ${course.title} (ID: ${course.id})\n`);
    
    // Check if curriculum exists
    if (!courseData.curriculum || !courseData.curriculum.sections) {
      console.error('❌ No curriculum data found in JSON');
      process.exit(1);
    }
    
    const curriculum = courseData.curriculum;
    const sections = curriculum.sections || [];
    
    console.log(`📊 Curriculum data:`);
    console.log(`   Total sections: ${curriculum.total_sections || sections.length}`);
    console.log(`   Total lectures: ${curriculum.total_lectures || 0}`);
    console.log(`   Total duration: ${curriculum.total_duration_seconds || 0} seconds\n`);
    
    // Update course with curriculum summary
    await course.update({
      total_sections: curriculum.total_sections || sections.length,
      total_lectures: curriculum.total_lectures || 0,
      total_duration_seconds: curriculum.total_duration_seconds || 0
    });
    
    // Delete existing curriculum (if any)
    const existingSections = await CurriculumSection.findAll({
      where: { course_id: course.id },
      include: [{ model: CurriculumLecture, as: 'lectures' }]
    });
    
    for (const section of existingSections) {
      await CurriculumLecture.destroy({ where: { section_id: section.id } });
    }
    await CurriculumSection.destroy({ where: { course_id: course.id } });
    
    console.log('🗑️  Cleared existing curriculum\n');
    
    let sectionsImported = 0;
    let lecturesImported = 0;
    
    // Import sections and lectures
    for (const sectionData of sections) {
      try {
        // Create section
        const section = await CurriculumSection.create({
          course_id: course.id,
          section_id: sectionData.id || null,
          section_index: sectionData.index || 0,
          title: sectionData.title || 'Untitled Section',
          lecture_count: sectionData.lecture_count || 0,
          duration_seconds: sectionData.duration_seconds || 0
        });
        
        sectionsImported++;
        console.log(`✅ Section ${section.section_index}: ${section.title.substring(0, 50)}...`);
        
        // Import lectures
        const lectures = sectionData.lectures || [];
        for (const lectureData of lectures) {
          try {
            await CurriculumLecture.create({
              section_id: section.id,
              lecture_id: lectureData.id || null,
              lecture_index: lectureData.index || 0,
              title: lectureData.title || 'Untitled Lecture',
              type: lectureData.type || 'VIDEO_LECTURE',
              duration_seconds: lectureData.duration_seconds || 0,
              is_previewable: lectureData.is_previewable || false
            });
            
            lecturesImported++;
          } catch (lectureError) {
            console.error(`   ❌ Failed to import lecture: ${lectureError.message}`);
          }
        }
        
        console.log(`   📝 Imported ${lectures.length} lectures\n`);
        
      } catch (sectionError) {
        console.error(`❌ Failed to import section: ${sectionError.message}`);
      }
    }
    
    // Print summary
    console.log('='.repeat(60));
    console.log('📊 IMPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Sections imported: ${sectionsImported}`);
    console.log(`✅ Lectures imported: ${lecturesImported}`);
    console.log(`\n✅ Curriculum import completed!`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Get course ID from command line argument
const courseId = process.argv[2] ? parseInt(process.argv[2]) : null;
importCurriculum(courseId);
