/**
 * Script to fix permanent courses that are completed but missing drive_link
 * This script will:
 * 1. Find permanent courses that are completed but missing drive_link
 * 2. Try to find drive_link from other completed tasks with same course_url
 * 3. Update the missing drive_link
 */

const { sequelize } = require('../src/models');
const DownloadTask = require('../src/models/downloadTask.model');
const Course = require('../src/models/course.model');
const { Op } = require('sequelize');
const { transformToSamsungUdemy } = require('../src/utils/url.util');

async function fixPermanentCoursesDriveLink() {
  try {
    console.log('🔍 Finding permanent courses with missing drive_link...');
    
    // Find permanent courses that are completed but missing drive_link
    const tasksWithoutDriveLink = await DownloadTask.findAll({
      where: {
        course_type: 'permanent',
        status: 'completed',
        [Op.or]: [
          { drive_link: null },
          { drive_link: '' }
        ]
      },
      attributes: ['id', 'course_url', 'title', 'status', 'drive_link', 'order_id']
    });

    console.log(`Found ${tasksWithoutDriveLink.length} permanent courses without drive_link`);

    let fixedCount = 0;
    let notFoundCount = 0;

    for (const task of tasksWithoutDriveLink) {
      console.log(`\n📋 Processing task ${task.id}: ${task.title || task.course_url}`);
      
      // Try to find drive_link from other completed tasks with same course_url
      const normalizedUrl = transformToSamsungUdemy(task.course_url) || task.course_url;
      
      // Search in download_tasks
      const existingTask = await DownloadTask.findOne({
        where: {
          [Op.or]: [
            { course_url: normalizedUrl },
            { course_url: task.course_url }
          ],
          course_type: 'permanent',
          status: 'completed',
          drive_link: { [Op.ne]: null },
          id: { [Op.ne]: task.id } // Exclude current task
        },
        attributes: ['id', 'drive_link'],
        order: [['updated_at', 'DESC']]
      });

      if (existingTask && existingTask.drive_link) {
        // Update task with found drive_link
        await task.update({ drive_link: existingTask.drive_link });
        console.log(`  ✅ Fixed: Updated drive_link from task ${existingTask.id}`);
        fixedCount++;
        continue;
      }

      // Search in courses table
      const existingCourse = await Course.findOne({
        where: {
          [Op.or]: [
            { course_url: normalizedUrl },
            { course_url: task.course_url }
          ],
          drive_link: { [Op.ne]: null }
        },
        attributes: ['id', 'drive_link']
      });

      if (existingCourse && existingCourse.drive_link) {
        // Update task with found drive_link
        await task.update({ drive_link: existingCourse.drive_link });
        console.log(`  ✅ Fixed: Updated drive_link from course ${existingCourse.id}`);
        fixedCount++;
        continue;
      }

      console.log(`  ⚠️  Not found: No drive_link found for this course`);
      notFoundCount++;
    }

    console.log('\n📊 Summary:');
    console.log(`  ✅ Fixed: ${fixedCount}`);
    console.log(`  ⚠️  Not found: ${notFoundCount}`);
    console.log(`  📋 Total processed: ${tasksWithoutDriveLink.length}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixPermanentCoursesDriveLink();
