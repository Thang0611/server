const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhook.controller');

// API: POST /api/v1/webhook/finalize
router.post('/finalize', webhookController.finalizeDownload);

module.exports = router;