/**
 * Webhook routes
 * @module routes/webhook
 */

const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhook.controller');
const { validateWebhookFinalize } = require('../middleware/validation.middleware');

/**
 * POST /api/v1/webhook/finalize
 * Finalizes a download task
 */
router.post('/finalize', validateWebhookFinalize, webhookController.finalizeDownload);

module.exports = router;