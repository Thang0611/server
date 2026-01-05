const express = require('express');
const router = express.Router();
const entrllControler = require('../controllers/enroll.controller');

// Định nghĩa: POST /api/v1/downloads/request
router.post('/enroll',entrllControler.enrollController);

module.exports = router;