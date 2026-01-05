const express = require('express');
const router = express.Router();
const grantAccessController = require('../controllers/grantAccess.controller');

// Định nghĩa API: POST /api/v1/manual/grant-list
router.post('/grant-access', grantAccessController.grantAccess);

module.exports = router;