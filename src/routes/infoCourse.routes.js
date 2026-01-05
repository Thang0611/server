const express = require('express');
const router = express.Router();
const courseController = require('../controllers/infoCourse.controller.js');

// Định nghĩa API POST /get-course-info
router.post('/get-course-info', courseController.getCourseInfo);

module.exports = router;