const express = require('express');
const router = express.Router();
const downloadController = require('../controllers/download.controller');

// Định nghĩa: POST /api/v1/downloads/download
router.post('/download', downloadController.download);

module.exports = router;