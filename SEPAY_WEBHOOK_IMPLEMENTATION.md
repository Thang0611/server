# SePay Webhook Implementation Summary

## Overview
Implemented Payment Confirmation & Download Trigger workflow using SePay Webhook with transaction support and proper error handling.

## Changes Made

### 1. Order Creation Status
**File:** `src/services/payment.service.js`
- Changed order creation status from `'paid'` to `'pending'`
- Orders now wait for payment confirmation via webhook

### 2. Webhook Handler with Transaction
**File:** `src/services/payment.service.js` - `processPaymentWebhook()`

**Key Features:**
- ✅ Uses Sequelize transaction for data consistency
- ✅ Extracts order code using regex `/DH\d+/i` (case insensitive)
- ✅ Returns `{ success: true }` immediately if:
  - Order not found
  - Order already paid (idempotent)
  - Invalid transfer content
- ✅ Validates `transferAmount >= order.total_amount` (with 1000 VND tolerance)
- ✅ Transaction updates:
  - `Order.payment_status` → `'paid'`
  - `DownloadTasks.status` → `'processing'` (from `'paid'`)
- ✅ After commit: Triggers `downloadService.processOrder()`
- ✅ Comprehensive logging for debugging
- ✅ Graceful error handling (returns success to stop retries)

### 3. Download Service - processOrder Function
**File:** `src/services/download.service.js`

**New Function:** `processOrder(order)`
- Verifies valid tasks for the order (status = 'processing')
- Triggers worker to process each task asynchronously
- Returns processing statistics
- Handles errors gracefully

### 4. Controller Updates
**File:** `src/controllers/payment.controller.js` - `handleWebhook()`

**Improvements:**
- Added comprehensive logging for webhook events
- Validates required fields (`transferContent`, `transferAmount`)
- Always returns success to prevent SePay retries
- Logs all errors for manual investigation

### 5. Worker Updates
**File:** `src/workers/download.worker.js`

**Changes:**
- Updated to process tasks with status `'processing'` (not `'pending'`)
- Status flow: `'paid'` → `'processing'` (after payment) → `'enrolled'` → `'completed'`

### 6. Routes
**File:** `src/routes/payment.routes.js`
- ✅ Route `/webhook` already exists and is properly configured
- Uses `validateWebhook` middleware

## Workflow

```
1. User creates order
   → Order status: 'pending'
   → Download tasks status: 'paid'
   → Response: { orderId, orderCode, qrCodeUrl, courses }

2. User pays via SePay
   → SePay sends webhook to /api/v1/payment/webhook

3. Webhook Processing (Transaction)
   → Extract order_code from transferContent (regex: /DH\d+/i)
   → Find order in DB
   → Validate: order exists, not already paid, amount >= expected
   → Transaction:
      - Update Order.payment_status → 'paid'
      - Update DownloadTasks.status → 'processing'
   → Commit transaction
   → Trigger downloadService.processOrder(order)

4. Download Processing
   → Find all tasks with status 'processing'
   → Trigger worker.processTask() for each task
   → Worker handles: enroll → download → upload → email

5. Response
   → Always return { success: true } to stop SePay retries
```

## Error Handling

### Invalid Cases (Return success, stop retries):
- Order code not found in transfer content
- Order not found in database
- Order already paid (idempotent)
- Insufficient payment amount

### Error Cases (Log error, return success):
- Transaction rollback on error
- Task update failures
- Worker processing failures

All errors are logged for manual investigation while preventing SePay from retrying indefinitely.

## Database Transaction Flow

```javascript
BEGIN TRANSACTION
  → Lock order for update
  → Validate order exists and not paid
  → Validate amount
  → Update Order.payment_status = 'paid'
  → Update DownloadTasks.status = 'processing'
COMMIT
  → Trigger downloadService.processOrder()
```

## Testing Checklist

- [ ] Test webhook with valid order code and amount
- [ ] Test webhook with order already paid (idempotent)
- [ ] Test webhook with non-existent order
- [ ] Test webhook with insufficient amount
- [ ] Test webhook with invalid transfer content
- [ ] Verify transaction rollback on errors
- [ ] Verify download tasks are updated to 'processing'
- [ ] Verify worker processes tasks with status 'processing'
- [ ] Check logs for all webhook events

## Logging

All webhook events are logged with:
- `console.log()` for debugging (includes full request body)
- `Logger.info/warn/error/success()` for structured logging
- Timestamps and order details
- Transaction status

## Notes

- Webhook always returns `{ success: true }` to prevent SePay retries
- Invalid cases are handled gracefully and logged
- Transaction ensures data consistency
- Download processing happens after transaction commit
- Worker processes tasks asynchronously
