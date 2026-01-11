const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');

// POST: Tạo đơn hàng
router.post('/create-order', paymentController.createOrder);

// POST: Webhook nhận từ SePay
router.post('/webhook', paymentController.handleWebhook);

// GET: Client hỏi trạng thái đơn
router.get('/check-status/:orderCode', paymentController.checkStatus);

module.exports = router;