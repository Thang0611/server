#!/bin/bash

# Test Full Order Flow: Create Order → Payment Webhook → Monitor Download → Verify Completion
# This script tests the complete order lifecycle

set -e

BASE_URL="${API_BASE_URL:-http://localhost:3000}"
API_VERSION="v1"

# Try to load SEPAY_API_KEY from .env file if exists
if [ -f ".env" ]; then
  # Load SEPAY_API_KEY from .env (handle quotes if present)
  SEPAY_API_KEY_FROM_ENV=$(grep "^SEPAY_API_KEY=" .env 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" | tr -d ' ' || echo "")
  if [ -n "$SEPAY_API_KEY_FROM_ENV" ]; then
    SEPAY_API_KEY="$SEPAY_API_KEY_FROM_ENV"
  fi
fi

SEPAY_API_KEY="${SEPAY_API_KEY:-test-key-please-set-in-env}"

if [ "$SEPAY_API_KEY" != "test-key-please-set-in-env" ]; then
  echo "✅ SEPAY_API_KEY loaded"
else
  echo "⚠️  SEPAY_API_KEY not found, using default (may fail)"
fi
echo ""

echo "=========================================="
echo "🧪 TEST FULL ORDER FLOW"
echo "=========================================="
echo "Base URL: $BASE_URL"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test email and course
TEST_EMAIL="test@example.com"
TEST_COURSE_URL="https://www.udemy.com/course/test-course/"

# ============================================
# STEP 1: CREATE ORDER
# ============================================
echo -e "${BLUE}📝 STEP 1: Creating Order...${NC}"
echo "----------------------------------------"

CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/$API_VERSION/payment/create-order" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"courses\": [
      {
        \"url\": \"$TEST_COURSE_URL\",
        \"title\": \"Test Course\"
      }
    ]
  }")

echo "Response:"
echo "$CREATE_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$CREATE_RESPONSE"
echo ""

ORDER_ID=$(echo "$CREATE_RESPONSE" | grep -o '"orderId":[0-9]*' | cut -d':' -f2 || echo "")
ORDER_CODE=$(echo "$CREATE_RESPONSE" | grep -o '"orderCode":"[^"]*"' | cut -d'"' -f4 || echo "")
TOTAL_AMOUNT=$(echo "$CREATE_RESPONSE" | grep -o '"totalAmount":[0-9]*' | cut -d':' -f2 || echo "")

if [ -z "$ORDER_CODE" ] || [ "$ORDER_CODE" = "null" ]; then
  echo -e "${RED}❌ FAILED: Could not extract orderCode${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Order created successfully!${NC}"
echo "   Order ID: $ORDER_ID"
echo "   Order Code: $ORDER_CODE"
echo "   Total Amount: $TOTAL_AMOUNT VND"
echo ""

# Wait a bit for DB to sync
sleep 1

# ============================================
# STEP 2: CHECK ORDER STATUS (BEFORE PAYMENT)
# ============================================
echo -e "${BLUE}📊 STEP 2: Checking Order Status (Before Payment)...${NC}"
echo "----------------------------------------"

STATUS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/$API_VERSION/payment/check-status/$ORDER_CODE")

PAYMENT_STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"paymentStatus":"[^"]*"' | cut -d'"' -f4 || echo "")
ORDER_STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"orderStatus":"[^"]*"' | cut -d'"' -f4 || echo "")

if [ "$PAYMENT_STATUS" = "pending" ]; then
  echo -e "${GREEN}✅ Order status: payment=$PAYMENT_STATUS, order=$ORDER_STATUS (expected)${NC}"
else
  echo -e "${YELLOW}⚠️  Unexpected status: payment=$PAYMENT_STATUS, order=$ORDER_STATUS${NC}"
fi
echo ""

# ============================================
# STEP 3: SIMULATE PAYMENT WEBHOOK
# ============================================
echo -e "${BLUE}💳 STEP 3: Simulating Payment Webhook...${NC}"
echo "----------------------------------------"

WEBHOOK_RESPONSE=$(curl -s -X POST "$BASE_URL/api/$API_VERSION/payment/webhook" \
  -H "Content-Type: application/json" \
  -H "Authorization: Apikey $SEPAY_API_KEY" \
  -d "{
    \"code\": \"$ORDER_CODE\",
    \"transferAmount\": $TOTAL_AMOUNT,
    \"gateway\": \"VCB\",
    \"transactionDate\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"referenceCode\": \"REF$(date +%s)\",
    \"content\": \"Payment for $ORDER_CODE\"
  }")

echo "Webhook Response:"
echo "$WEBHOOK_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$WEBHOOK_RESPONSE"
echo ""

WEBHOOK_SUCCESS=$(echo "$WEBHOOK_RESPONSE" | grep -o '"success":true' || echo "")

if [ -n "$WEBHOOK_SUCCESS" ]; then
  echo -e "${GREEN}✅ Payment webhook processed successfully!${NC}"
else
  echo -e "${RED}❌ Payment webhook failed${NC}"
  echo "$WEBHOOK_RESPONSE"
  exit 1
fi

# Wait for enrollment and queue processing
echo "Waiting 3 seconds for enrollment and queue processing..."
sleep 3
echo ""

# ============================================
# STEP 4: CHECK ORDER STATUS (AFTER PAYMENT)
# ============================================
echo -e "${BLUE}📊 STEP 4: Checking Order Status (After Payment)...${NC}"
echo "----------------------------------------"

STATUS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/$API_VERSION/payment/check-status/$ORDER_CODE")

PAYMENT_STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"paymentStatus":"[^"]*"' | cut -d'"' -f4 || echo "")
ORDER_STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"orderStatus":"[^"]*"' | cut -d'"' -f4 || echo "")

echo "Current Status:"
echo "  Payment Status: $PAYMENT_STATUS"
echo "  Order Status: $ORDER_STATUS"
echo ""

if [ "$PAYMENT_STATUS" = "paid" ]; then
  echo -e "${GREEN}✅ Payment confirmed!${NC}"
else
  echo -e "${YELLOW}⚠️  Payment status: $PAYMENT_STATUS (expected 'paid')${NC}"
fi

if [ "$ORDER_STATUS" = "processing" ]; then
  echo -e "${GREEN}✅ Order is processing!${NC}"
else
  echo -e "${YELLOW}⚠️  Order status: $ORDER_STATUS (expected 'processing')${NC}"
fi
echo ""

# ============================================
# STEP 5: MONITOR ORDER STATUS (POLLING)
# ============================================
echo -e "${BLUE}👀 STEP 5: Monitoring Order Status (Polling every 5 seconds)...${NC}"
echo "----------------------------------------"
echo "Press Ctrl+C to stop monitoring early"
echo ""

MAX_CHECKS=60  # Check for 5 minutes max
CHECK_INTERVAL=5
CHECK_COUNT=0

while [ $CHECK_COUNT -lt $MAX_CHECKS ]; do
  CHECK_COUNT=$((CHECK_COUNT + 1))
  
  STATUS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/$API_VERSION/payment/check-status/$ORDER_CODE")
  PAYMENT_STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"paymentStatus":"[^"]*"' | cut -d'"' -f4 || echo "")
  ORDER_STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"orderStatus":"[^"]*"' | cut -d'"' -f4 || echo "")
  
  echo "[$CHECK_COUNT/$MAX_CHECKS] Status: payment=$PAYMENT_STATUS, order=$ORDER_STATUS"
  
  if [ "$ORDER_STATUS" = "completed" ]; then
    echo -e "${GREEN}✅ Order completed!${NC}"
    break
  fi
  
  if [ "$ORDER_STATUS" = "failed" ]; then
    echo -e "${RED}❌ Order failed!${NC}"
    break
  fi
  
  sleep $CHECK_INTERVAL
done

echo ""

# ============================================
# STEP 6: FINAL STATUS CHECK
# ============================================
echo -e "${BLUE}📊 STEP 6: Final Status Check...${NC}"
echo "----------------------------------------"

STATUS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/$API_VERSION/payment/check-status/$ORDER_CODE")

echo "Final Status Response:"
echo "$STATUS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$STATUS_RESPONSE"
echo ""

PAYMENT_STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"paymentStatus":"[^"]*"' | cut -d'"' -f4 || echo "")
ORDER_STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"orderStatus":"[^"]*"' | cut -d'"' -f4 || echo "")

# ============================================
# SUMMARY
# ============================================
echo "=========================================="
echo "📋 TEST SUMMARY"
echo "=========================================="
echo "Order Code: $ORDER_CODE"
echo "Final Payment Status: $PAYMENT_STATUS"
echo "Final Order Status: $ORDER_STATUS"
echo ""

if [ "$PAYMENT_STATUS" = "paid" ] && [ "$ORDER_STATUS" = "completed" ]; then
  echo -e "${GREEN}✅ SUCCESS: Order fully processed!${NC}"
elif [ "$PAYMENT_STATUS" = "paid" ] && [ "$ORDER_STATUS" = "processing" ]; then
  echo -e "${YELLOW}⚠️  PARTIAL: Payment confirmed but order still processing${NC}"
  echo "   Note: Download may still be in progress. Check logs for details."
else
  echo -e "${RED}❌ FAILED: Order did not complete successfully${NC}"
fi

echo "=========================================="
