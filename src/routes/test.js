const express = require('express');
const router = express.Router();
const downloadController = require('../controllers/download.controller');

// Định nghĩa: POST /api/v1/downloads/request
router.post('/request', downloadController.requestDownload);

module.exports = router;