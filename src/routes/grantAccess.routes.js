/**
 * Grant access routes
 * @module routes/grantAccess
 */

const express = require('express');
const router = express.Router();
const grantAccessController = require('../controllers/grantAccess.controller');
const { validateGrantAccess } = require('../middleware/validation.middleware');

/**
 * POST /api/v1/grant-access
 * Grants Google Drive access to customer for purchased courses
 */
router.post('/grant-access', validateGrantAccess, grantAccessController.grantAccess);

module.exports = router;