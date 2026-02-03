/**
 * Video Controller
 * Handles video streaming and curriculum for enrolled users
 * @module controllers/video
 */

const { UserEnrollment, Course } = require('../models');
const bunnyService = require('../services/bunny.service');
const courseMetadataService = require('../services/courseMetadata.service');
const Logger = require('../utils/logger.util');
const { AppError } = require('../middleware/errorHandler.middleware');

/**
 * Get course curriculum with sections and lectures
 * 
 * GET /api/v1/videos/:courseId/curriculum
 */
const getCurriculum = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const { userId } = req.query;

        // Check enrollment if userId provided
        if (userId) {
            const enrollment = await UserEnrollment.findOne({
                where: { user_id: userId, course_id: courseId }
            });

            if (!enrollment) {
                throw new AppError('Bạn chưa có quyền truy cập khóa học này', 403);
            }
        }

        // Get curriculum from database
        const curriculum = await courseMetadataService.getCourseCurriculum(courseId);

        // Get course info
        const course = await Course.findByPk(courseId, {
            attributes: ['id', 'title', 'slug', 'course_type', 'streaming_ready']
        });

        res.json({
            success: true,
            course: course ? {
                id: course.id,
                title: course.title,
                slug: course.slug,
                courseType: course.course_type,
                streamingReady: course.streaming_ready
            } : null,
            curriculum
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Get streaming URL for a specific lecture
 * 
 * GET /api/v1/videos/:courseId/lecture/:lectureId
 */
const getLectureStream = async (req, res, next) => {
    try {
        const { courseId, lectureId } = req.params;
        const { userId } = req.query;

        if (!userId) {
            throw new AppError('User ID is required', 401);
        }

        // Check enrollment
        const enrollment = await UserEnrollment.findOne({
            where: { user_id: userId, course_id: courseId }
        });

        if (!enrollment) {
            Logger.warn('[Video] Unauthorized stream access', { userId, courseId, lectureId });
            throw new AppError('Bạn chưa có quyền truy cập khóa học này', 403);
        }

        // Check expiration
        if (enrollment.expires_at && new Date(enrollment.expires_at) < new Date()) {
            throw new AppError('Quyền truy cập đã hết hạn', 403);
        }

        // Get lecture info
        const lecture = await courseMetadataService.getLecture(lectureId);

        if (!lecture) {
            throw new AppError('Không tìm thấy bài giảng', 404);
        }

        if (lecture.course_id !== parseInt(courseId)) {
            throw new AppError('Bài giảng không thuộc khóa học này', 400);
        }

        // Generate signed URL via Bunny CDN Pull Zone
        const streamUrl = bunnyService.generateCourseVideoUrl(
            lecture.course_slug,
            lecture.relative_path,
            lecture.course_type || 'permanent',
            7200 // 2 hours
        );

        Logger.info('[Video] Lecture stream generated', {
            userId,
            courseId,
            lectureId,
            title: lecture.title
        });

        res.json({
            success: true,
            lecture: {
                id: lecture.id,
                title: lecture.title,
                sectionTitle: lecture.section_title,
                position: lecture.position
            },
            streamUrl,
            expiresIn: 7200
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Check streaming access for a course
 * 
 * GET /api/v1/videos/:courseId/access
 */
const checkAccess = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const { userId } = req.query;

        // Get course info
        const course = await Course.findByPk(courseId, {
            attributes: ['id', 'title', 'slug', 'streaming_ready', 'vps_path']
        });

        if (!course) {
            return res.json({
                success: true,
                hasAccess: false,
                reason: 'course_not_found'
            });
        }

        if (!userId) {
            return res.json({
                success: true,
                hasAccess: false,
                reason: 'not_authenticated',
                streamingReady: course.streaming_ready,
                hasVpsPath: !!course.vps_path
            });
        }

        const enrollment = await UserEnrollment.findOne({
            where: { user_id: userId, course_id: courseId }
        });

        if (!enrollment) {
            return res.json({
                success: true,
                hasAccess: false,
                reason: 'not_enrolled'
            });
        }

        // Check expiration
        if (enrollment.expires_at && new Date(enrollment.expires_at) < new Date()) {
            return res.json({
                success: true,
                hasAccess: false,
                reason: 'expired'
            });
        }

        res.json({
            success: true,
            hasAccess: true,
            canStream: course.streaming_ready && !!course.vps_path,
            hasDriveLink: !!enrollment.drive_link,
            accessType: enrollment.access_type,
            expiresAt: enrollment.expires_at,
            course: {
                title: course.title,
                slug: course.slug,
                streamingReady: course.streaming_ready
            }
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Legacy: Get streaming URL (for backward compatibility)
 * Redirects to first lecture
 * 
 * GET /api/v1/videos/:courseId/stream
 */
const getStreamUrl = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const { userId } = req.query;

        if (!userId) {
            throw new AppError('User ID is required', 401);
        }

        // Check enrollment
        const enrollment = await UserEnrollment.findOne({
            where: { user_id: userId, course_id: courseId },
            include: [{ model: Course, as: 'course', attributes: ['id', 'title', 'slug', 'streaming_ready', 'vps_path'] }]
        });

        if (!enrollment) {
            throw new AppError('Bạn chưa có quyền truy cập khóa học này', 403);
        }

        // Check if streaming is ready
        if (!enrollment.course?.streaming_ready || !enrollment.course?.vps_path) {
            // Return drive link if available
            if (enrollment.drive_link) {
                return res.json({
                    success: true,
                    streamType: 'drive',
                    driveLink: enrollment.drive_link,
                    message: 'Khóa học này chưa có video streaming'
                });
            }
            throw new AppError('Video chưa sẵn sàng', 404);
        }

        // Get curriculum - redirect to first lecture
        const curriculum = await courseMetadataService.getCourseCurriculum(courseId);

        if (curriculum.sections.length === 0 || curriculum.sections[0].lectures.length === 0) {
            throw new AppError('Không tìm thấy video trong khóa học', 404);
        }

        const firstLecture = curriculum.sections[0].lectures[0];
        const streamUrl = bunnyService.generateCourseVideoUrl(
            enrollment.course.slug,
            firstLecture.relative_path,
            enrollment.course.course_type || 'permanent',
            7200
        );

        res.json({
            success: true,
            streamType: 'bunny',
            streamUrl,
            expiresIn: 7200,
            course: {
                id: enrollment.course.id,
                title: enrollment.course.title,
                slug: enrollment.course.slug
            },
            lecture: {
                id: firstLecture.id,
                title: firstLecture.title
            }
        });

    } catch (error) {
        next(error);
    }
};

module.exports = {
    getCurriculum,
    getLectureStream,
    checkAccess,
    getStreamUrl
};
