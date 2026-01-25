/**
 * Courses API Routes
 * @module routes/courses
 */

const express = require('express');
const router = express.Router();
const Course = require('../models/course.model');
const CurriculumSection = require('../models/curriculumSection.model');
const CurriculumLecture = require('../models/curriculumLecture.model');
const { asyncHandler } = require('../middleware/errorHandler.middleware');
const { Op } = require('sequelize');
const Logger = require('../utils/logger.util');

/**
 * GET /api/courses
 * Lấy danh sách khóa học với filter category, platform, search
 * Query params:
 *   - category: Filter by category (default: 'Tất cả')
 *   - platform: Filter by platform (default: 'Tất cả')
 *   - search: Search in title and instructor
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 20)
 */
router.get('/', asyncHandler(async (req, res) => {
  const { category, platform, search, page = 1, limit = 20 } = req.query;
  
  // Build where clause
  const where = { status: 'active' };
  
  // Filter by category
  if (category && category !== 'Tất cả' && category.trim() !== '') {
    where.category = category;
  }
  
  // Filter by platform
  if (platform && platform !== 'Tất cả' && platform.trim() !== '') {
    where.platform = platform;
  }
  
  // Search in title and instructor
  if (search && search.trim() !== '') {
    where[Op.or] = [
      { title: { [Op.like]: `%${search.trim()}%` } },
      { instructor: { [Op.like]: `%${search.trim()}%` } }
    ];
  }
  
  // Calculate pagination
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20)); // Max 100 items per page
  const offset = (pageNum - 1) * limitNum;
  
  Logger.debug('Fetching courses', {
    where,
    page: pageNum,
    limit: limitNum,
    offset
  });
  
  // Fetch courses with pagination
  const { count, rows } = await Course.findAndCountAll({
    where,
    limit: limitNum,
    offset,
    order: [['created_at', 'DESC']]
  });
  
  const totalPages = Math.ceil(count / limitNum);
  
  res.json({
    success: true,
    courses: rows,
    pagination: {
      total: count,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    }
  });
}));

/**
 * GET /api/courses/categories
 * Lấy danh sách tất cả categories có trong database
 */
router.get('/categories', asyncHandler(async (req, res) => {
  const categories = await Course.findAll({
    attributes: [
      [require('sequelize').fn('DISTINCT', require('sequelize').col('category')), 'category']
    ],
    where: {
      status: 'active',
      category: { [Op.ne]: null }
    },
    raw: true
  });
  
  const categoryList = categories
    .map(c => c.category)
    .filter(c => c && c.trim() !== '')
    .sort();
  
  res.json({
    success: true,
    categories: categoryList
  });
}));

/**
 * GET /api/courses/platforms
 * Lấy danh sách tất cả platforms có trong database
 */
router.get('/platforms', asyncHandler(async (req, res) => {
  const platforms = await Course.findAll({
    attributes: [
      [require('sequelize').fn('DISTINCT', require('sequelize').col('platform')), 'platform']
    ],
    where: {
      status: 'active',
      platform: { [Op.ne]: null }
    },
    raw: true
  });
  
  const platformList = platforms
    .map(p => p.platform)
    .filter(p => p && p.trim() !== '')
    .sort();
  
  res.json({
    success: true,
    platforms: platformList
  });
}));

/**
 * GET /api/courses/:id
 * Lấy thông tin chi tiết của một khóa học (tối ưu hóa cho frontend)
 * Hỗ trợ cả ID (số) và slug (string)
 * Curriculum được tách ra endpoint riêng để lazy load
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const identifier = req.params.id;
  
  // Try to parse as number (backward compatibility)
  const courseId = parseInt(identifier);
  let course;
  
  if (!isNaN(courseId)) {
    // If it's a number, find by ID
    course = await Course.findByPk(courseId, {
    attributes: [
      'id',
      'course_url',
      'title',
      'thumbnail',
      'instructor',
      'rating',
      'students',
      'duration',
      'lectures',
      'category',
      'platform',
      'description',
      'price',
      'original_price',
      'bestseller',
      'drive_link',
      'status',
      'total_sections',
      'total_lectures',
      'total_duration_seconds'
    ]
    });
  } else {
    // If it's not a number, find by slug
    course = await Course.findOne({
      where: { slug: identifier },
      attributes: [
        'id',
        'course_url',
        'slug',
        'title',
        'thumbnail',
        'instructor',
        'rating',
        'students',
        'duration',
        'lectures',
        'category',
        'platform',
        'description',
        'price',
        'original_price',
        'bestseller',
        'drive_link',
        'status',
        'total_sections',
        'total_lectures',
        'total_duration_seconds'
      ]
    });
  }
  
  if (!course) {
    return res.status(404).json({
      success: false,
      error: 'Course not found'
    });
  }
  
  // Format data cho frontend
  const formattedCourse = {
    id: course.id,
    slug: course.slug,
    url: course.course_url, // Frontend dùng 'url' thay vì 'course_url'
    title: course.title,
    thumbnail: course.thumbnail,
    instructor: course.instructor,
    rating: course.rating ? parseFloat(course.rating) : null, // Convert DECIMAL to number
    students: course.students ? parseInt(course.students) : null, // Convert to number
    duration: course.duration, // Giữ nguyên format "21.12 hours"
    lectures: course.lectures ? parseInt(course.lectures) : null, // Convert to number
    category: course.category,
    platform: course.platform || 'Udemy',
    description: course.description,
    price: parseFloat(course.price) || 50000, // Convert DECIMAL to number
    originalPrice: course.original_price ? parseFloat(course.original_price) : null, // Frontend dùng camelCase
    bestseller: course.bestseller || false,
    driveLink: course.drive_link, // Frontend dùng camelCase
    status: course.status,
    // Curriculum summary (không include full curriculum để giảm payload)
    curriculumSummary: {
      totalSections: course.total_sections || 0,
      totalLectures: course.total_lectures || 0,
      totalDurationSeconds: course.total_duration_seconds || 0,
      // Format duration cho display
      formattedDuration: course.duration 
        ? (course.duration.includes('hours') ? course.duration : `${course.duration} hours`)
        : (course.total_duration_seconds 
          ? `${(course.total_duration_seconds / 3600).toFixed(1)} hours` 
          : null)
    },
    // Tính toán discount percentage
    discountPercentage: course.original_price && course.price
      ? Math.round((1 - parseFloat(course.price) / parseFloat(course.original_price)) * 100)
      : null,
    // Format rating với số chữ số thập phân
    formattedRating: course.rating ? parseFloat(course.rating).toFixed(1) : null,
    // Format students với K/M
    formattedStudents: course.students 
      ? course.students >= 1000000 
        ? `${(course.students / 1000000).toFixed(1)}M`
        : course.students >= 1000
        ? `${(course.students / 1000).toFixed(1)}K`
        : course.students.toString()
      : null
  };
  
  res.json({
    success: true,
    course: formattedCourse
  });
}));

/**
 * GET /api/courses/:id/curriculum
 * Lấy curriculum (sections và lectures) của một khóa học
 * Hỗ trợ cả ID (số) và slug (string)
 */
router.get('/:id/curriculum', asyncHandler(async (req, res) => {
  const identifier = req.params.id;
  
  // Try to parse as number (backward compatibility)
  const courseId = parseInt(identifier);
  let course;
  
  if (!isNaN(courseId)) {
    // If it's a number, find by ID
    course = await Course.findByPk(courseId);
  } else {
    // If it's not a number, find by slug
    course = await Course.findOne({ where: { slug: identifier } });
  }
  
  if (!course) {
    return res.status(404).json({
      success: false,
      error: 'Course not found'
    });
  }
  
  // Fetch curriculum
  const sections = await CurriculumSection.findAll({
    where: { course_id: course.id },
    include: [{
      model: CurriculumLecture,
      as: 'lectures',
      order: [['lecture_index', 'ASC']]
    }],
    order: [['section_index', 'ASC']]
  });
  
  res.json({
    success: true,
    curriculum: {
      total_sections: course.total_sections || sections.length,
      total_lectures: course.total_lectures || 0,
      total_duration_seconds: course.total_duration_seconds || 0,
      sections: sections.map(section => ({
        id: section.id,
        section_id: section.section_id,
        section_index: section.section_index,
        title: section.title,
        lecture_count: section.lecture_count,
        duration_seconds: section.duration_seconds,
        lectures: section.lectures.map(lecture => ({
          id: lecture.id,
          lecture_id: lecture.lecture_id,
          lecture_index: lecture.lecture_index,
          title: lecture.title,
          type: lecture.type,
          duration_seconds: lecture.duration_seconds,
          is_previewable: lecture.is_previewable
        }))
      }))
    }
  });
}));

/**
 * POST /api/courses/import
 * Import courses from URLs
 * Body: { urls: string[], shouldDownload: boolean }
 */
const courseImportController = require('../controllers/courseImport.controller');
router.post('/import', courseImportController.importCourses);

/**
 * DELETE /api/courses/:id
 * Delete a course by ID (admin only)
 * Note: This should be protected by admin middleware in production
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const courseId = parseInt(req.params.id);
  
  if (isNaN(courseId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid course ID'
    });
  }

  // Check if course exists
  const course = await Course.findByPk(courseId);
  if (!course) {
    return res.status(404).json({
      success: false,
      error: 'Course not found'
    });
  }

  // Delete related curriculum first
  const sections = await CurriculumSection.findAll({
    where: { course_id: courseId }
  });

  for (const section of sections) {
    await CurriculumLecture.destroy({
      where: { section_id: section.id }
    });
  }

  await CurriculumSection.destroy({
    where: { course_id: courseId }
  });

  // Delete the course
  await Course.destroy({
    where: { id: courseId }
  });

  Logger.info('Course deleted', { courseId, title: course.title });

  res.json({
    success: true,
    message: 'Course deleted successfully'
  });
}));

module.exports = router;
