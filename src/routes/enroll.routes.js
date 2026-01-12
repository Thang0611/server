/**
 * Enroll routes
 * @module routes/enroll
 */

const express = require('express');
const router = express.Router();
const enrollController = require('../controllers/enroll.controller');
const { validateEnroll } = require('../middleware/validation.middleware');

/**
 * POST /api/v1/enroll
 * Enrolls user in courses
 */
router.post('/enroll', validateEnroll, enrollController.enrollController);

module.exports = router;