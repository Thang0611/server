/**
 * Admin Download Service
 * Dedicated service for admin course downloads (no order required)
 * Downloads directly and updates drive_link to courses table
 * @module services/adminDownload
 */

const { Course, DownloadTask } = require('../models');
const { Op } = require('sequelize');
const enrollService = require('./enroll.service');
const { addDownloadJob } = require('../queues/download.queue');
const Logger = require('../utils/logger.util');
const { AppError } = require('../middleware/errorHandler.middleware');
const { transformToSamsungUdemy } = require('../utils/url.util');

/**
 * Triggers admin download for a course
 * Creates a download task and starts the download process
 * @param {number} courseId - Course ID
 * @param {string} email - Email for enrollment (defaults to ADMIN_EMAIL)
 * @returns {Promise<Object>} - Created task info
 */
const triggerAdminDownload = async (courseId, email = null) => {
  // ✅ FIX: Always use getcourses.net@gmail.com for admin downloads (required for enrollment)
  // Override ADMIN_EMAIL env var to ensure correct email is used
  const adminEmail = email || 'getcourses.net@gmail.com';

  Logger.info('[AdminDownload] Starting admin download', {
    courseId,
    email: adminEmail
  });

  // ✅ NEW: Check cookie validity before proceeding
  try {
    const { checkCookieFile } = require('../utils/cookieValidator.util');
    const cookieCheck = checkCookieFile();
    
    if (!cookieCheck.exists || !cookieCheck.hasContent) {
      Logger.warn('[AdminDownload] Cookie file issue detected', {
        courseId,
        cookieIssue: cookieCheck.error
      });
      throw new AppError(`Cookie issue: ${cookieCheck.error}. Vui lòng kiểm tra file cookies.txt`, 400);
    }
  } catch (cookieError) {
    if (cookieError instanceof AppError) {
      throw cookieError;
    }
    Logger.warn('[AdminDownload] Could not verify cookie, proceeding anyway', cookieError);
  }

  // Find course
  const course = await Course.findByPk(courseId, {
    attributes: ['id', 'title', 'course_url', 'drive_link']
  });

  if (!course) {
    throw new AppError('Course not found', 404);
  }

  if (course.drive_link) {
    throw new AppError('Course already has drive link', 400);
  }

  if (!course.course_url) {
    throw new AppError('Course does not have course_url', 400);
  }

  // ✅ FIX: Transform course URL to samsungu.udemy.com before creating task
  const transformedCourseUrl = transformToSamsungUdemy(course.course_url) || course.course_url;
  
  Logger.info('[AdminDownload] URL transformation', {
    originalUrl: course.course_url,
    transformedUrl: transformedCourseUrl
  });

  // ✅ FIX: Create download task with proper validation
  // Ensure task is created and saved to database before proceeding
  let task;
  try {
    task = await DownloadTask.create({
      course_url: transformedCourseUrl, // Use transformed URL
      title: course.title,
      email: adminEmail,
      order_id: null, // No order for admin downloads
      phone_number: null,
      course_type: 'permanent', // Permanent download
      status: 'processing', // Start processing immediately
      retry_count: 0,
      price: 0
    });

    // ✅ CRITICAL: Verify task was created and has valid ID
    if (!task || !task.id) {
      throw new AppError('Failed to create download task: Task ID is null', 500);
    }

    // ✅ VERIFY: Reload task from database to ensure it was saved
    const savedTask = await DownloadTask.findByPk(task.id);
    if (!savedTask) {
      throw new AppError(`Task ${task.id} was created but not found in database`, 500);
    }

    Logger.info('[AdminDownload] Download task created and verified', {
      taskId: task.id,
      courseId: course.id,
      originalUrl: course.course_url,
      transformedUrl: transformedCourseUrl,
      email: adminEmail,
      status: savedTask.status
    });
  } catch (createError) {
    Logger.error('[AdminDownload] Failed to create download task', createError, {
      courseId: course.id,
      courseUrl: course.course_url,
      email: adminEmail
    });
    throw new AppError(`Failed to create download task: ${createError.message}`, 500);
  }

  // Start enrollment and download process
  try {
    // Step 1: Enroll if Udemy course
    if (course.course_url && course.course_url.includes('udemy.com')) {
      Logger.info('[AdminDownload] Attempting enrollment for admin download', {
        taskId: task.id,
        courseId: course.id,
        courseUrl: transformedCourseUrl
      });

      try {
        const enrollResults = await enrollService.enrollCourses(
          [transformedCourseUrl], // Use transformed URL for enrollment
          adminEmail,
          null // No orderId for admin downloads
        );

        const result = enrollResults[0];
        if (!result || !result.success) {
          // ✅ FIX: For admin downloads, enrollment failure is not fatal
          // The course might already be enrolled, or enrollment might fail due to cookie/auth issues
          // Keep status as 'processing' so worker can attempt download anyway
          // enroll.service.js will keep status as 'processing' for admin downloads (not set to 'failed')
          Logger.warn('[AdminDownload] Enrollment failed, but continuing with download', {
            taskId: task.id,
            courseId: course.id,
            error: result ? result.message : 'Unknown error',
            status: result ? result.status : 'unknown',
            note: 'Worker will attempt download - course might already be enrolled'
          });
          
          // Verify task status is still 'processing' (enroll service should keep it as 'processing' for admin)
          const taskStatus = await DownloadTask.findByPk(task.id, {
            attributes: ['id', 'status']
          });
          
          if (taskStatus && taskStatus.status === 'failed') {
            // If somehow status was set to 'failed', reset to 'processing'
            Logger.warn('[AdminDownload] Task status was set to failed, resetting to processing', {
              taskId: task.id
            });
            await DownloadTask.update(
              { status: 'processing' },
              { where: { id: task.id } }
            );
          }
        } else {
          // Update task status to enrolled
          await DownloadTask.update(
            { status: 'enrolled' },
            { where: { id: task.id } }
          );

          Logger.success('[AdminDownload] Enrollment successful', {
            taskId: task.id,
            courseId: course.id,
            courseId: result.courseId,
            title: result.title
          });
        }
      } catch (enrollError) {
        // ✅ FIX: Catch enrollment errors but don't fail the whole process
        // For admin downloads, we can still try to download even if enrollment fails
        Logger.error('[AdminDownload] Enrollment error caught, but continuing with download', enrollError, {
          taskId: task.id,
          courseId: course.id,
          note: 'Worker will attempt download - course might already be enrolled'
        });
        
        // Ensure task status is 'processing' (not 'failed')
        const taskStatus = await DownloadTask.findByPk(task.id, {
          attributes: ['id', 'status']
        });
        
        if (taskStatus && taskStatus.status === 'failed') {
          Logger.warn('[AdminDownload] Task status was set to failed after enrollment error, resetting to processing', {
            taskId: task.id
          });
          await DownloadTask.update(
            { status: 'processing', error_log: enrollError.message },
            { where: { id: task.id } }
          );
        }
      }
    } else {
      // Non-Udemy course, skip enrollment and set status to 'enrolled' directly
      Logger.info('[AdminDownload] Non-Udemy course, skipping enrollment', {
        taskId: task.id,
        courseId: course.id,
        courseUrl: course.course_url
      });
      await DownloadTask.update(
        { status: 'enrolled' },
        { where: { id: task.id } }
      );
    }

    // Step 2: Queue download job
    // ✅ CRITICAL: Verify task still exists before queuing
    const taskBeforeQueue = await DownloadTask.findByPk(task.id, {
      attributes: ['id', 'email', 'course_url', 'status']
    });
    
    if (!taskBeforeQueue) {
      throw new AppError(`Task ${task.id} not found in database before queuing job`, 500);
    }

    if (taskBeforeQueue.email !== adminEmail) {
      Logger.warn('[AdminDownload] Task email mismatch', {
        taskId: task.id,
        expectedEmail: adminEmail,
        taskEmail: taskBeforeQueue.email
      });
      // Update task email to ensure consistency
      await DownloadTask.update(
        { email: adminEmail },
        { where: { id: task.id } }
      );
    }

    // ✅ FIX: Ensure course_url in task is samsungu.udemy.com format
    const taskCourseUrl = taskBeforeQueue.course_url;
    const finalCourseUrl = transformToSamsungUdemy(taskCourseUrl) || taskCourseUrl;
    
    if (taskCourseUrl !== finalCourseUrl) {
      Logger.info('[AdminDownload] Updating task course_url to samsungu.udemy.com format', {
        taskId: task.id,
        originalUrl: taskCourseUrl,
        transformedUrl: finalCourseUrl
      });
      await DownloadTask.update(
        { course_url: finalCourseUrl },
        { where: { id: task.id } }
      );
    }

    await addDownloadJob({
      taskId: task.id,
      email: adminEmail,
      courseUrl: finalCourseUrl // Use transformed URL
    });

    Logger.success('[AdminDownload] Download job queued', {
      taskId: task.id,
      courseId: course.id,
      email: adminEmail,
      courseUrl: finalCourseUrl
    });

    return {
      success: true,
      taskId: task.id,
      courseId: course.id,
      courseTitle: course.title,
      status: 'queued'
    };
  } catch (error) {
    // Update task status to failed
    await DownloadTask.update(
      {
        status: 'failed',
        error_log: error.message
      },
      { where: { id: task.id } }
    );

    Logger.error('[AdminDownload] Failed to start download', error, {
      taskId: task.id,
      courseId: course.id
    });

    throw new AppError(`Failed to start download: ${error.message}`, 500);
  }
};

/**
 * Updates course drive_link when admin download completes
 * Called from webhook when download is finished
 * @param {number} taskId - Download task ID
 * @param {string} driveLink - Google Drive link
 * @returns {Promise<Object>} - Update result
 */
const updateCourseDriveLink = async (taskId, driveLink) => {
  Logger.info('[AdminDownload] Updating course drive_link', {
    taskId,
    hasDriveLink: !!driveLink
  });

  // Find task
  const task = await DownloadTask.findByPk(taskId, {
    attributes: ['id', 'course_url', 'course_type', 'order_id']
  });

  if (!task) {
    throw new AppError('Task not found', 404);
  }

  // Only update for permanent courses (admin downloads)
  if (task.course_type !== 'permanent' || task.order_id !== null) {
    Logger.debug('[AdminDownload] Skipping course update - not an admin download', {
      taskId,
      courseType: task.course_type,
      orderId: task.order_id
    });
    return { updated: false, reason: 'Not an admin download' };
  }

  // Find course by course_url (try multiple URL formats)
  const { transformToSamsungUdemy, transformToNormalizeUdemyCourseUrl } = require('../utils/url.util');
  
  // ✅ FIX: Tạo nhiều biến thể URL để tìm course
  // Xử lý trường hợp URL khác nhau: samsungu.udemy.com vs www.udemy.com
  const urlVariants = [
    task.course_url,
    transformToSamsungUdemy(task.course_url) || task.course_url,
    transformToNormalizeUdemyCourseUrl(task.course_url) || task.course_url,
    task.course_url.replace('samsungu.', 'www.'),  // samsungu. → www.
    task.course_url.replace('www.', 'samsungu.'),  // www. → samsungu.
    task.course_url.replace(/\/$/, ''),            // Remove trailing slash
    task.course_url + '/',                          // Add trailing slash
    task.course_url.split('?')[0]                   // Remove query params
  ].filter((v, i, a) => a.indexOf(v) === i && v); // Remove duplicates and null/undefined

  // Tìm course với nhiều biến thể URL
  let course = await Course.findOne({
    where: {
      course_url: { [Op.in]: urlVariants }
    }
  });

  // ✅ FIX: Fallback - Tìm bằng slug nếu không tìm thấy
  if (!course) {
    const slug = task.course_url.split('/').pop()?.split('?')[0];
    if (slug) {
      Logger.debug('[AdminDownload] Trying to find course by slug', {
        taskId,
        slug,
        taskUrl: task.course_url
      });
      
      course = await Course.findOne({
        where: {
          course_url: { [Op.like]: `%${slug}%` }
        }
      });
    }
  }

  if (!course) {
    Logger.warn('[AdminDownload] Course not found in courses table', {
      taskId,
      courseUrl: task.course_url,
      urlVariants: urlVariants.slice(0, 5) // Log first 5 variants
    });
    return { updated: false, reason: 'Course not found' };
  }

  // Update drive_link
  await course.update({ drive_link: driveLink });

  Logger.success('[AdminDownload] Course drive_link updated', {
    taskId,
    courseId: course.id,
    courseTitle: course.title,
    driveLink
  });

  return {
    updated: true,
    courseId: course.id,
    courseTitle: course.title,
    driveLink
  };
};

module.exports = {
  triggerAdminDownload,
  updateCourseDriveLink
};
