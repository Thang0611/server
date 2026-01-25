/**
 * Course Import Service
 * Service để craw và import courses vào database
 * @module services/courseImport
 */

const Course = require('../models/course.model');
const CurriculumSection = require('../models/curriculumSection.model');
const CurriculumLecture = require('../models/curriculumLecture.model');
const Logger = require('../utils/logger.util');
const { AppError } = require('../middleware/errorHandler.middleware');
const { getFullCourseInfo } = require('../crawler/getCourseInfo');
const { validateCourseUrl } = require('../crawler/urlValidator');
const { extractSlugFromUrl, generateSlugFromTitle } = require('../utils/url.util');

/**
 * Craw course info using crawler module
 * @param {string} url - Course URL (will be validated and sanitized)
 * @returns {Promise<Object>} - Course data
 */
async function crawlCourseInfo(url) {
  try {
    // Validate URL first
    const validation = validateCourseUrl(url);
    if (!validation.valid) {
      throw new AppError(`URL không hợp lệ: ${validation.error}`, 400);
    }
    
    const sanitizedUrl = validation.sanitized;
    Logger.debug('Starting course crawl', { originalUrl: url, sanitizedUrl });
    
    // Call crawler module directly (safer than exec)
    const data = await getFullCourseInfo(sanitizedUrl, {
      silent: true, // Suppress console logs in production
      cookiesPath: process.env.COOKIES_PATH || null
    });
    
    // Log curriculum info for debugging
    const hasCurriculum = !!(data.curriculum && data.curriculum.sections);
    const sectionsCount = data.curriculum?.sections?.length || 0;
    let totalLectures = 0;
    if (data.curriculum?.sections) {
      totalLectures = data.curriculum.sections.reduce((sum, s) => sum + (s.lectures?.length || 0), 0);
      
      // Log detailed info for each section
      data.curriculum.sections.forEach((s, i) => {
        Logger.debug('Section details', {
          index: i + 1,
          title: s.title,
          lecturesCount: s.lectures?.length || 0,
          hasLecturesArray: Array.isArray(s.lectures),
          lecturesSample: s.lectures?.slice(0, 2).map(l => l.title) || []
        });
      });
    }
    
    Logger.info('Course crawl successful', { 
      url: sanitizedUrl, 
      title: data.title?.substring(0, 50),
      hasCurriculum,
      sectionsCount,
      totalLectures
    });
    
    return data;
  } catch (error) {
    Logger.error('Error crawling course info', { url, error: error.message, stack: error.stack });
    
    if (error instanceof AppError) {
      throw error;
    }
    
    throw new AppError(`Không thể craw thông tin khóa học: ${error.message}`, 500);
  }
}

/**
 * Import course data into database
 * @param {Object} courseData - Course data from crawler
 * @param {boolean} shouldDownload - Whether to mark for download
 * @returns {Promise<Object>} - Imported course record
 */
async function importCourseToDatabase(courseData, shouldDownload = false) {
  try {
    // Extract or generate slug
    const courseUrl = courseData.url || courseData.course_url || null;
    let slug = extractSlugFromUrl(courseUrl);
    if (!slug && courseData.title) {
      slug = generateSlugFromTitle(courseData.title);
    }
    
    // Prepare course data
    const courseRecordData = {
      course_url: courseUrl,
      slug: slug,
      title: courseData.title || 'Untitled Course',
      thumbnail: courseData.thumbnail || null,
      instructor: courseData.instructor?.name || courseData.instructor || null,
      rating: courseData.rating?.score || courseData.rating || null,
      students: courseData.students || courseData.rating?.count || null,
      duration: courseData.content?.video_hours || courseData.content?.duration || null,
      lectures: courseData.content?.lectures || courseData.content?.lecture_count || null,
      category: courseData.metadata?.category || courseData.category || null,
      platform: 'Udemy',
      description: courseData.description?.short || courseData.description || null,
      price: 50000,
      original_price: null,
      bestseller: courseData.bestseller || false,
      drive_link: shouldDownload ? null : null, // Will be set when download completes
      status: 'active',
      total_sections: courseData.curriculum?.total_sections || courseData.content?.sections || null,
      total_lectures: courseData.curriculum?.total_lectures || courseData.content?.lectures || null,
      total_duration_seconds: courseData.curriculum?.total_duration_seconds || courseData.content?.total_duration_seconds || null
    };

    if (!courseRecordData.course_url) {
      throw new AppError('Course URL is required', 400);
    }

    // Upsert course
    const [courseRecord, created] = await Course.upsert(courseRecordData, {
      returning: true
    });

    // Import curriculum if available
    if (courseData.curriculum && courseData.curriculum.sections && Array.isArray(courseData.curriculum.sections)) {
      // Get existing sections
      const existingSections = await CurriculumSection.findAll({
        where: { course_id: courseRecord.id }
      });

      // Delete lectures first
      for (const section of existingSections) {
        await CurriculumLecture.destroy({
          where: { section_id: section.id }
        });
      }

      // Delete sections
      await CurriculumSection.destroy({
        where: { course_id: courseRecord.id }
      });

      // Import new sections and lectures
      let totalSections = 0;
      let totalLectures = 0;
      
      for (const sectionData of courseData.curriculum.sections) {
        const sectionRecord = await CurriculumSection.create({
          course_id: courseRecord.id,
          section_id: sectionData.id || null,
          section_index: sectionData.index || sectionData.section_index || 0,
          title: sectionData.title || 'Untitled Section',
          lecture_count: sectionData.lecture_count || (sectionData.lectures ? sectionData.lectures.length : 0),
          duration_seconds: sectionData.duration_seconds || 0
        });

        totalSections++;

        // Import lectures
        if (sectionData.lectures && Array.isArray(sectionData.lectures)) {
          if (sectionData.lectures.length > 0) {
            Logger.debug('Importing lectures for section', { 
              sectionId: sectionRecord.id, 
              sectionTitle: sectionRecord.title,
              lectureCount: sectionData.lectures.length 
            });
            
            for (const lectureData of sectionData.lectures) {
              try {
                await CurriculumLecture.create({
                  section_id: sectionRecord.id,
                  lecture_id: lectureData.id || null,
                  lecture_index: lectureData.index || lectureData.lecture_index || 0,
                  title: lectureData.title || 'Untitled Lecture',
                  type: lectureData.type || 'VIDEO_LECTURE',
                  duration_seconds: lectureData.duration_seconds || 0,
                  is_previewable: lectureData.is_previewable || false
                });
                totalLectures++;
              } catch (lectureError) {
                Logger.error('Error creating lecture', { 
                  sectionId: sectionRecord.id,
                  lectureData,
                  error: lectureError.message 
                });
                throw lectureError;
              }
            }
          } else {
            Logger.warn('Section has empty lectures array', { 
              sectionId: sectionRecord.id, 
              sectionTitle: sectionRecord.title,
              sectionData: JSON.stringify(sectionData).substring(0, 200)
            });
          }
        } else {
          Logger.warn('Section has no lectures property or not an array', { 
            sectionId: sectionRecord.id, 
            sectionTitle: sectionRecord.title,
            hasLectures: !!sectionData.lectures,
            lecturesType: typeof sectionData.lectures
          });
        }
      }
      
      Logger.info('Curriculum imported successfully', {
        courseId: courseRecord.id,
        sections: totalSections,
        lectures: totalLectures
      });
    }

    return {
      course: courseRecord,
      created,
      hasCurriculum: !!(courseData.curriculum && courseData.curriculum.sections)
    };
  } catch (error) {
    Logger.error('Error importing course to database', { 
      url: courseData.url, 
      error: error.message 
    });
    throw error;
  }
}

/**
 * Import multiple courses from URLs
 * @param {Array<string>} urls - Array of course URLs
 * @param {boolean} shouldDownload - Whether to mark courses for download
 * @returns {Promise<Object>} - Import results
 */
async function importCourses(urls, shouldDownload = false) {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new AppError('Vui lòng cung cấp danh sách URL hợp lệ', 400);
  }

  Logger.info('Starting course import', { 
    urlCount: urls.length, 
    shouldDownload 
  });

  const results = [];
  const errors = [];
  let imported = 0;
  let updated = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    
    try {
      Logger.debug('Processing course URL', { 
        url, 
        index: i + 1, 
        total: urls.length 
      });

      // Craw course info
      const courseData = await crawlCourseInfo(url);

      // Import to database
      const importResult = await importCourseToDatabase(courseData, shouldDownload);

      if (importResult.created) {
        imported++;
      } else {
        updated++;
      }

      results.push({
        success: true,
        url,
        courseId: importResult.course.id,
        title: importResult.course.title,
        created: importResult.created,
        hasCurriculum: importResult.hasCurriculum
      });

      // Delay between requests to avoid rate limiting - tăng delay để đảm bảo lấy đầy đủ lecture
      if (i < urls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Tăng từ 2s lên 5s
      }
    } catch (error) {
      Logger.error('Error processing course URL', { 
        url, 
        error: error.message 
      });
      
      errors.push({
        url,
        error: error.message
      });

      results.push({
        success: false,
        url,
        error: error.message
      });
    }
  }

  return {
    success: true,
    total: urls.length,
    imported,
    updated,
    failed: errors.length,
    results,
    errors
  };
}

module.exports = {
  importCourses,
  crawlCourseInfo,
  importCourseToDatabase
};
