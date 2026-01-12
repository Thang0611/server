/**
 * Download routes
 * @module routes/download
 */

const express = require('express');
const router = express.Router();
const downloadController = require('../controllers/download.controller');
const { validateDownload } = require('../middleware/validation.middleware');

/**
 * POST /api/v1/download
 * Creates download tasks for courses
 */
router.post('/download', validateDownload, downloadController.download);

module.exports = router;