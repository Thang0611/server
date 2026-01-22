#!/bin/bash

# Test Order Flow: Create Order → Check Status
# This script tests the order creation flow

set -e

BASE_URL="${API_BASE_URL:-http://localhost:3000}"
API_VERSION="v1"

echo "=========================================="
echo "🧪 TEST ORDER FLOW"
echo "=========================================="
echo "Base URL: $BASE_URL"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Create Order
echo "📝 Test 1: Create Order"
echo "----------------------------------------"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/$API_VERSION/payment/create-order" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "courses": [
      {
        "url": "https://www.udemy.com/course/test-course/",
        "title": "Test Course"
      }
    ]
  }')

echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""

ORDER_CODE=$(echo "$RESPONSE" | grep -o '"orderCode":"[^"]*"' | cut -d'"' -f4 || echo "")

if [ -z "$ORDER_CODE" ] || [ "$ORDER_CODE" = "null" ]; then
  echo -e "${RED}❌ FAILED: Could not extract orderCode${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Order created: $ORDER_CODE${NC}"
echo ""

# Test 2: Check Order Status
echo "📊 Test 2: Check Order Status"
echo "----------------------------------------"
STATUS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/$API_VERSION/payment/check-status/$ORDER_CODE")

echo "Response:"
echo "$STATUS_RESPONSE" | jq '.' 2>/dev/null || echo "$STATUS_RESPONSE"
echo ""

PAYMENT_STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"paymentStatus":"[^"]*"' | cut -d'"' -f4 || echo "")

if [ "$PAYMENT_STATUS" = "pending" ]; then
  echo -e "${GREEN}✅ Order status: $PAYMENT_STATUS (expected)${NC}"
else
  echo -e "${YELLOW}⚠️  Order status: $PAYMENT_STATUS${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✅ All tests completed!${NC}"
echo "Order Code: $ORDER_CODE"
echo "=========================================="
