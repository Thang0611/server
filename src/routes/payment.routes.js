/**
 * Payment routes
 * @module routes/payment
 */

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const {
  validateCreateOrder,
  validateWebhook
} = require('../middleware/validation.middleware');

// POST: Create order
router.post('/create-order', validateCreateOrder, paymentController.createOrder);

// POST: Payment webhook from gateway
router.post('/webhook', validateWebhook, paymentController.handleWebhook);

// GET: Check order status (optimized for polling)
router.get('/check-status/:orderCode', paymentController.checkOrderStatus);

// GET: Lookup orders by email
router.get('/lookup', paymentController.lookupOrders);

module.exports = router;