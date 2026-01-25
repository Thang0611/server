/**
 * Script to sync drive_link from download_tasks to courses table for permanent courses
 * This ensures that permanent courses in the courses table have the latest drive_link
 */

const { sequelize } = require('../src/models');
const DownloadTask = require('../src/models/downloadTask.model');
const Course = require('../src/models/course.model');
const { Op } = require('sequelize');
const { transformToSamsungUdemy, transformToNormalizeUdemyCourseUrl } = require('../src/utils/url.util');

async function syncPermanentCoursesDriveLink() {
  try {
    console.log('🔄 Syncing drive_link from download_tasks to courses table...\n');
    
    // Find all completed permanent courses with drive_link using raw SQL
    const completedTasks = await sequelize.query(`
      SELECT id, course_url, title, drive_link, updated_at
      FROM download_tasks
      WHERE course_type = 'permanent'
        AND status = 'completed'
        AND drive_link IS NOT NULL
        AND drive_link != ''
      ORDER BY updated_at DESC
    `, {
      type: sequelize.QueryTypes.SELECT
    });

    console.log(`Found ${completedTasks.length} completed permanent courses with drive_link\n`);

    let syncedCount = 0;
    let notFoundCount = 0;
    let alreadySyncedCount = 0;

    for (const task of completedTasks) {
      console.log(`📋 Processing task ${task.id}: ${task.title || task.course_url}`);
      console.log(`   Drive link: ${task.drive_link}`);
      
      // Normalize URLs để tìm course
      const normalizedUrl1 = transformToSamsungUdemy(task.course_url) || task.course_url;
      const normalizedUrl2 = transformToNormalizeUdemyCourseUrl(task.course_url) || task.course_url;
      
      // Tìm course trong bảng courses với nhiều format URL
      const course = await Course.findOne({
        where: {
          [Op.or]: [
            { course_url: task.course_url },
            { course_url: normalizedUrl1 },
            { course_url: normalizedUrl2 }
          ]
        },
        attributes: ['id', 'course_url', 'title', 'drive_link']
      });

      if (!course) {
        console.log(`   ⚠️  Course not found in courses table`);
        notFoundCount++;
        continue;
      }

      // Check if drive_link needs update
      if (course.drive_link === task.drive_link) {
        console.log(`   ✅ Already synced (same drive_link)`);
        alreadySyncedCount++;
        continue;
      }

      // Update drive_link
      const oldDriveLink = course.drive_link || 'NULL';
      await course.update({ drive_link: task.drive_link });
      console.log(`   ✅ Synced: ${oldDriveLink} → ${task.drive_link}`);
      syncedCount++;
    }

    console.log('\n📊 Summary:');
    console.log(`  ✅ Synced: ${syncedCount}`);
    console.log(`  ✅ Already synced: ${alreadySyncedCount}`);
    console.log(`  ⚠️  Course not found: ${notFoundCount}`);
    console.log(`  📋 Total processed: ${completedTasks.length}`);

    // Also check courses that have drive_link but task doesn't (reverse sync)
    console.log('\n🔄 Checking reverse sync (courses → tasks)...');
    
    const coursesWithDriveLink = await Course.findAll({
      where: {
        drive_link: { [Op.ne]: null }
      },
      attributes: ['id', 'course_url', 'title', 'drive_link']
    });

    let reverseSyncedCount = 0;
    for (const course of coursesWithDriveLink) {
      const normalizedUrl1 = transformToSamsungUdemy(course.course_url) || course.course_url;
      const normalizedUrl2 = transformToNormalizeUdemyCourseUrl(course.course_url) || course.course_url;
      
      // Find tasks without drive_link using raw SQL
      const tasksWithoutDriveLink = await sequelize.query(`
        SELECT id, course_url, drive_link
        FROM download_tasks
        WHERE course_type = 'permanent'
          AND status = 'completed'
          AND (drive_link IS NULL OR drive_link = '')
          AND (
            course_url = :courseUrl1
            OR course_url = :courseUrl2
            OR course_url = :courseUrl3
          )
      `, {
        replacements: {
          courseUrl1: course.course_url,
          courseUrl2: normalizedUrl1,
          courseUrl3: normalizedUrl2
        },
        type: sequelize.QueryTypes.SELECT
      });

      for (const task of tasksWithoutDriveLink) {
        await DownloadTask.update(
          { drive_link: course.drive_link },
          { where: { id: task.id } }
        );
        console.log(`   ✅ Updated task ${task.id} with drive_link from course ${course.id}`);
        reverseSyncedCount++;
      }
    }

    if (reverseSyncedCount > 0) {
      console.log(`\n✅ Reverse synced: ${reverseSyncedCount} tasks`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

syncPermanentCoursesDriveLink();
