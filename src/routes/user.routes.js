/**
 * User routes
 * @module routes/user
 */

const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');

// POST: Sync user from OAuth login (called by frontend after Google OAuth)
router.post('/sync', userController.syncUser);

// GET: Get user profile
router.get('/:userId', userController.getProfile);

// GET: Get user's enrolled courses
router.get('/:userId/enrollments', userController.getEnrollments);

// GET: Get user's orders
router.get('/:userId/orders', userController.getUserOrders);

// GET: Check if user has access to a specific course
router.get('/:userId/access/:courseId', userController.checkCourseAccess);

module.exports = router;
