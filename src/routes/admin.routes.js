/**
 * Admin Routes - Dashboard for monitoring paid orders
 * @module routes/admin
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { verifyToken, verifyAdmin } = require('../middleware/auth.middleware');

// Apply authentication middleware to all admin routes
router.use((req, res, next) => {
  const Logger = require('../utils/logger.util');
  Logger.info('[Admin Route] Request received', {
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    hasAuthHeader: !!req.headers.authorization
  });
  next();
});

router.use(verifyToken);
router.use(verifyAdmin);

/**
 * @route   GET /api/admin/orders/paid
 * @desc    Get all paid orders with tasks (hierarchical view)
 * @access  Admin
 * @query   page, limit, order_status, search
 */
router.get('/orders/paid', adminController.getPaidOrders);

/**
 * @route   POST /api/admin/orders/:id/resend-email
 * @desc    Resend completion email for an order
 * @access  Admin
 */
router.post('/orders/:id/resend-email', adminController.resendOrderEmail);

/**
 * @route   POST /api/admin/orders/:id/retry-download
 * @desc    Retry download for non-completed courses in an order
 * @access  Admin
 */
router.post('/orders/:id/retry-download', adminController.retryOrderDownload);

/**
 * @route   POST /api/admin/orders/:id/recover
 * @desc    Recover stuck tasks for a specific order
 * @access  Admin
 */
router.post('/orders/:id/recover', adminController.recoverOrderTasks);

/**
 * @route   GET /api/admin/orders/:id/logs
 * @desc    Get unified logs for a specific order (audit logs + task logs)
 * @access  Admin
 * @query   severity, category, source, limit
 */
router.get('/orders/:id/logs', adminController.getOrderAuditLogs);

/**
 * @route   GET /api/admin/orders/:id
 * @desc    Get detailed order with tasks and audit logs
 * @access  Admin
 */
router.get('/orders/:id', adminController.getOrderDetails);

/**
 * @route   POST /api/admin/tasks/recover
 * @desc    Recover all stuck tasks (system-wide recovery)
 * @access  Admin
 * @body    { maxTasks: number } (optional)
 */
router.post('/tasks/recover', adminController.recoverAllStuckTasks);

/**
 * @route   GET /api/admin/tasks/:id/logs
 * @desc    Get logs for a specific task
 * @access  Admin
 * @query   level, category, source, limit
 */
router.get('/tasks/:id/logs', adminController.getTaskLogs);

/**
 * @route   GET /api/admin/tasks/:id/logs/raw
 * @desc    Get raw task log file content (worker download logs)
 * @access  Admin
 * @query   lines (default: 200)
 */
router.get('/tasks/:id/logs/raw', adminController.getTaskLogsRaw);

/**
 * @route   GET /api/admin/dashboard/stats
 * @desc    Get dashboard statistics for paid orders
 * @access  Admin
 */
router.get('/dashboard/stats', adminController.getDashboardStats);

/**
 * @route   POST /api/admin/courses/:id/download
 * @desc    Trigger download for a course (permanent download)
 * @access  Admin
 */
router.post('/courses/:id/download', adminController.triggerCourseDownload);

/**
 * @route   GET /api/admin/system/check-cookie
 * @desc    Check Udemy cookie validity
 * @access  Admin
 * @query   skipValidation (optional, boolean) - Skip actual validation, just check file
 */
router.get('/system/check-cookie', adminController.checkCookie);

module.exports = router;
