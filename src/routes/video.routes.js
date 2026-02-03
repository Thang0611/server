/**
 * Video Routes
 * Handles video streaming and curriculum for enrolled users
 */

const express = require('express');
const router = express.Router();
const videoController = require('../controllers/video.controller');

/**
 * @route   GET /api/v1/videos/:courseId/curriculum
 * @desc    Get course curriculum (sections & lectures)
 * @access  Authenticated + Enrolled
 * @query   userId - Backend user ID
 */
router.get('/:courseId/curriculum', videoController.getCurriculum);

/**
 * @route   GET /api/v1/videos/:courseId/lecture/:lectureId
 * @desc    Get signed streaming URL for a lecture
 * @access  Authenticated + Enrolled
 * @query   userId - Backend user ID
 */
router.get('/:courseId/lecture/:lectureId', videoController.getLectureStream);

/**
 * @route   GET /api/v1/videos/:courseId/access
 * @desc    Check if user has streaming access
 * @access  Public (returns access status)
 * @query   userId - Backend user ID (optional)
 */
router.get('/:courseId/access', videoController.checkAccess);

/**
 * @route   GET /api/v1/videos/:courseId/stream
 * @desc    Legacy: Get streaming URL (redirects to first lecture)
 * @access  Authenticated + Enrolled
 * @query   userId - Backend user ID
 */
router.get('/:courseId/stream', videoController.getStreamUrl);

module.exports = router;
