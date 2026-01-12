/**
 * Info course routes
 * @module routes/infoCourse
 */

const express = require('express');
const router = express.Router();
const courseController = require('../controllers/infoCourse.controller');

/**
 * POST /api/v1/get-course-info
 * Gets course information for provided URLs
 */
router.post('/get-course-info', courseController.getCourseInfo);

module.exports = router;