/**
 * Admin Routes - Dashboard for monitoring paid orders
 * @module routes/admin
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');

/**
 * @route   GET /api/admin/orders/paid
 * @desc    Get all paid orders with tasks (hierarchical view)
 * @access  Admin
 * @query   page, limit, order_status, search
 */
router.get('/orders/paid', adminController.getPaidOrders);

/**
 * @route   GET /api/admin/orders/:id
 * @desc    Get detailed order with tasks and audit logs
 * @access  Admin
 */
router.get('/orders/:id', adminController.getOrderDetails);

/**
 * @route   GET /api/admin/orders/:id/logs
 * @desc    Get unified logs for a specific order (audit logs + task logs)
 * @access  Admin
 * @query   severity, category, source, limit
 */
router.get('/orders/:id/logs', adminController.getOrderAuditLogs);

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

module.exports = router;
