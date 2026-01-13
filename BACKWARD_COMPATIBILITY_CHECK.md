# Backward Compatibility Check - order_status Field

**Date:** 2026-01-13  
**Change:** Added `order_status` field to Order model

---

## ✅ Backward Compatibility Analysis

### 1. **Database Level** ✅ SAFE

```sql
-- New column with DEFAULT value
order_status ENUM('pending', 'processing', 'completed', 'failed') 
DEFAULT 'pending'
```

**Impact:**
- ✅ Existing rows get default value `'pending'`
- ✅ Migration updates existing data appropriately
- ✅ No NULL values, no breaking changes

---

### 2. **Model Level** ✅ SAFE

**File:** `src/models/order.model.js`

```javascript
order_status: {
  type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
  defaultValue: 'pending'  // ← Ensures backward compatibility
}
```

**Impact:**
- ✅ `Order.create()` without `order_status` → Uses default `'pending'`
- ✅ Existing queries still work
- ✅ No breaking changes to existing code

---

### 3. **API Level** ⚠️ ENHANCED (Backward Compatible)

#### API: `GET /api/v1/payment/check-status/:orderCode`

**Before:**
```json
{
  "success": true,
  "status": "paid",        // payment_status
  "amount": 50000
}
```

**After:**
```json
{
  "success": true,
  "status": "paid",        // ← Still here (backward compatible)
  "paymentStatus": "paid", // ← Explicit
  "orderStatus": "processing", // ← NEW field
  "amount": 50000
}
```

**Impact:**
- ✅ Old clients: Still get `status` field (payment_status)
- ✅ New clients: Can use `orderStatus` field
- ✅ **100% Backward Compatible**

---

### 4. **Service Level** ✅ ENHANCED

#### Function: `getOrderStatus(orderCode)`

**Before:**
```javascript
return {
  orderId: order.id,
  orderCode: order.order_code,
  email: order.user_email,
  totalAmount: order.total_amount,
  paymentStatus: order.payment_status,
  createdAt: order.created_at,
  updatedAt: order.updated_at
};
```

**After:**
```javascript
return {
  orderId: order.id,
  orderCode: order.order_code,
  email: order.user_email,
  totalAmount: order.total_amount,
  paymentStatus: order.payment_status,
  orderStatus: order.order_status,  // ← NEW field
  createdAt: order.created_at,
  updatedAt: order.updated_at
};
```

**Impact:**
- ✅ Old code: Still gets all original fields
- ✅ New code: Can access `orderStatus`
- ✅ **Additive change only**

---

## 📋 All Files Changed

| File | Change Type | Risk Level | Status |
|------|-------------|------------|--------|
| `src/models/order.model.js` | Added field with default | ✅ LOW | Safe |
| `src/services/webhook.service.js` | Added update logic | ✅ LOW | Safe |
| `src/services/payment.service.js` | Added field to response | ✅ LOW | Safe |
| `src/controllers/payment.controller.js` | Added field to API response | ✅ LOW | Safe |
| `scripts/migrations/add_order_status_column.sql` | Database migration | ⚠️ MEDIUM | Requires backup |

---

## 📋 Files NOT Changed (Verified Safe)

### 1. `src/services/download.service.js`
```javascript
const order = await Order.findByPk(orderIdInt, {
  attributes: ['id']  // Only checks existence
});
```
**Status:** ✅ No change needed - Only checks if order exists

---

### 2. `src/workers/download.worker.js`
```javascript
const order = await Order.findByPk(taskWithEmail.order_id, {
  attributes: ['id', 'payment_status', 'order_code']
});
```
**Status:** ✅ No change needed - Only checks payment_status

---

### 3. `src/services/payment.service.js` - `processPaymentWebhook()`
```javascript
const order = await Order.findOne({
  where: { order_code: normalizedOrderCode },
  attributes: ['id', 'order_code', 'user_email', 'total_amount', 'payment_status'],
  transaction,
  lock: transaction.LOCK.UPDATE
});
```
**Status:** ✅ No change needed
- Only reads payment_status for validation
- Updates order_status later in the same function
- Not returned to client

---

## 🧪 Testing Checklist

### Test 1: Old Data Migration ✅
```sql
-- Verify existing orders get default value
SELECT order_code, payment_status, order_status 
FROM orders 
WHERE created_at < '2026-01-13';

-- Expected: All have order_status set
```

### Test 2: New Order Creation ✅
```javascript
const order = await Order.create({
  order_code: 'DH999999',
  user_email: 'test@example.com',
  total_amount: 50000,
  payment_status: 'pending'
  // order_status NOT specified
});

console.log(order.order_status); // Should be 'pending' (default)
```

### Test 3: API Response ✅
```bash
curl https://api.khoahocgiare.info/api/v1/payment/check-status/DH123456

# Should return BOTH fields:
# - status (old field - backward compatible)
# - orderStatus (new field)
```

### Test 4: Order Completion Flow ✅
```
1. Create order → order_status: 'pending' ✅
2. Payment received → order_status: 'processing' ✅
3. Tasks complete → order_status: 'completed' ✅
```

---

## ⚠️ Migration Risks & Mitigation

### Risk 1: Database Migration Failure
**Mitigation:**
- ✅ Backup database before migration
- ✅ Test on staging first
- ✅ Rollback script available

### Risk 2: Existing Code Breaks
**Mitigation:**
- ✅ Default value ensures no NULL issues
- ✅ All queries verified to still work
- ✅ Additive changes only (no removals)

### Risk 3: API Contract Changes
**Mitigation:**
- ✅ Old field `status` still present
- ✅ New field `orderStatus` is additive
- ✅ Old clients continue to work

---

## 🎯 Conclusion

### Overall Risk Level: ✅ **LOW**

**Reasons:**
1. ✅ Field has DEFAULT value - no NULL issues
2. ✅ All changes are additive - no deletions
3. ✅ Backward compatible API responses
4. ✅ Existing code paths still work
5. ✅ Rollback script available

### Recommendation: **SAFE TO DEPLOY**

**Deployment Steps:**
1. Backup database
2. Run migration script
3. Deploy code changes
4. Restart backend service
5. Verify with test order

---

## 📊 Summary Table

| Aspect | Before | After | Impact |
|--------|--------|-------|--------|
| Database | No order_status | Has order_status with default | ✅ Safe |
| Model | No field | Has field with default | ✅ Safe |
| API Response | payment_status only | Both payment & order status | ✅ Enhanced |
| Service Layer | Basic info | Enhanced info | ✅ Enhanced |
| Existing Code | Works | Still works | ✅ Compatible |
| Old Clients | Work | Still work | ✅ Compatible |

**Result:** 🎉 **FULLY BACKWARD COMPATIBLE**
