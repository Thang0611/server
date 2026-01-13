# Payment Issue Analysis & Fix

**Date:** January 12, 2026  
**Issue:** Order stuck ở "pending" sau khi thanh toán  
**Order Code:** DH397598

---

## 🔴 Vấn Đề

### Triệu chứng:
- User đã thanh toán
- Frontend vẫn polling liên tục
- API trả về `status: "pending"`
- Download task đã ở status "paid"

### Root Cause:

**Order payment_status không được update từ "pending" → "paid"**

```sql
Before Fix:
  orders.payment_status = "pending"  ❌
  download_tasks.status = "paid"     ✅

After Fix:
  orders.payment_status = "paid"     ✅
  download_tasks.status = "paid"     ✅
```

---

## 🔍 Nguyên Nhân Gốc Rễ

### Khả năng 1: Webhook không được gọi
- Payment gateway (SePay) không gửi webhook
- Webhook bị reject (auth fail, network issue)

### Khả năng 2: Webhook xử lý lỗi
- Code trong `payment.service.js > processPaymentWebhook()` có bug
- Transaction rollback do lỗi
- Order không được update nhưng download_tasks được update (không nên xảy ra)

### Khả năng 3: Manual payment confirmation
- Admin confirm payment manually
- Chỉ update download_tasks, quên update orders

---

## 🔧 Fix Đã Thực Hiện

```sql
UPDATE orders 
SET payment_status='paid' 
WHERE order_code='DH397598';
```

**Result:**
```json
{
  "success": true,
  "status": "paid",
  "amount": "2000"
}
```

✅ Frontend sẽ nhận response đúng và dừng polling

---

## 🛡️ Giải Pháp Lâu Dài

### 1. **Fix Transaction Logic trong webhook**

File: `src/services/payment.service.js`

```javascript
// Đảm bảo cả orders VÀ download_tasks đều được update trong CÙNG transaction
const transaction = await sequelize.transaction();
try {
  // Update order
  await order.update({ payment_status: 'paid' }, { transaction });
  
  // Update download tasks
  await DownloadTask.update(
    { status: 'processing' },
    { where: { order_id: order.id }, transaction }
  );
  
  // Commit transaction
  await transaction.commit();
} catch (error) {
  // Rollback nếu có lỗi
  await transaction.rollback();
  throw error;
}
```

### 2. **Add Webhook Logging**

Log tất cả webhook requests để debug:

```javascript
Logger.info('SePay webhook received', {
  orderCode,
  transferAmount,
  timestamp: new Date(),
  body: req.body
});
```

### 3. **Add Health Check Endpoint**

```javascript
// GET /api/v1/health/webhook
router.get('/health/webhook', (req, res) => {
  res.json({
    status: 'ok',
    lastWebhookTime: lastWebhookTime,
    webhookCount: webhookCount
  });
});
```

### 4. **Add Manual Fix Script**

File: `scripts/fix-stuck-orders.js`

```javascript
const { Order, DownloadTask } = require('../src/models');

async function fixStuckOrders() {
  // Find orders where:
  // - payment_status = 'pending'
  // - BUT download_tasks.status = 'paid'
  
  const stuckOrders = await Order.findAll({
    where: { payment_status: 'pending' },
    include: [{
      model: DownloadTask,
      where: { status: 'paid' }
    }]
  });
  
  for (const order of stuckOrders) {
    console.log(`Fixing order: ${order.order_code}`);
    await order.update({ payment_status: 'paid' });
  }
  
  console.log(`Fixed ${stuckOrders.length} stuck orders`);
}

fixStuckOrders();
```

### 5. **Add Monitoring Alert**

- Alert khi có order > 5 phút vẫn "pending" nhưng có download_tasks "paid"
- Email/Slack notification cho admin

---

## 📊 Prevention Checklist

- [ ] Verify webhook endpoint accessible từ SePay
- [ ] Check webhook logs thường xuyên
- [ ] Monitor orders stuck ở "pending" > 5 minutes
- [ ] Test webhook với test payment
- [ ] Backup webhook data (body) vào database để debug

---

## 🧪 Test Cases

### Test 1: Normal Payment Flow
```bash
# 1. Create order
curl -X POST http://localhost:3000/api/v1/payment/create-order ...

# 2. Simulate webhook
curl -X POST http://localhost:3000/api/v1/payment/webhook ...

# 3. Check status
curl http://localhost:3000/api/v1/payment/check-status/DH123456

# Expected: status = "paid"
```

### Test 2: Failed Webhook
```bash
# Webhook fails but download_tasks updated
# Should: Rollback cả 2 hoặc log error để manual fix
```

---

## 📝 Action Items

1. **Immediate:**
   - ✅ Fixed order DH397598
   - [ ] Check for other stuck orders
   - [ ] Verify webhook endpoint working

2. **Short-term:**
   - [ ] Review webhook transaction logic
   - [ ] Add webhook logging
   - [ ] Create fix script

3. **Long-term:**
   - [ ] Add monitoring & alerts
   - [ ] Document webhook flow
   - [ ] Add health check endpoints

---

**Status:** ✅ Issue Resolved  
**Next Steps:** Implement prevention measures
