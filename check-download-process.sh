#!/bin/bash

# Check Download Process: Monitor tasks, check finalize webhook, verify email
# This script checks the download process from start to completion

set -e

BASE_URL="${API_BASE_URL:-http://localhost:3000}"
API_VERSION="v1"
ORDER_CODE="${1:-DH000044}"  # Use provided order code or default

echo "=========================================="
echo "🔍 KIỂM TRA QUÁ TRÌNH DOWNLOAD"
echo "=========================================="
echo "Order Code: $ORDER_CODE"
echo "Base URL: $BASE_URL"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================
# STEP 1: CHECK ORDER STATUS
# ============================================
echo -e "${BLUE}📊 STEP 1: Checking Order Status...${NC}"
echo "----------------------------------------"

STATUS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/$API_VERSION/payment/check-status/$ORDER_CODE")

if echo "$STATUS_RESPONSE" | grep -q "not found"; then
  echo -e "${RED}❌ Order not found: $ORDER_CODE${NC}"
  exit 1
fi

PAYMENT_STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"paymentStatus":"[^"]*"' | cut -d'"' -f4 || echo "")
ORDER_STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"orderStatus":"[^"]*"' | cut -d'"' -f4 || echo "")

echo "Order Status:"
echo "  Payment: $PAYMENT_STATUS"
echo "  Order: $ORDER_STATUS"
echo ""

# ============================================
# STEP 2: GET ORDER DETAILS WITH TASKS
# ============================================
echo -e "${BLUE}📋 STEP 2: Getting Order Details with Tasks...${NC}"
echo "----------------------------------------"

# Extract email from order (we'll use lookup endpoint)
ORDER_EMAIL=$(echo "$STATUS_RESPONSE" | grep -o '"email":"[^"]*"' | cut -d'"' -f4 || echo "test@example.com")

if [ -z "$ORDER_EMAIL" ] || [ "$ORDER_EMAIL" = "null" ]; then
  ORDER_EMAIL="test@example.com"
fi

LOOKUP_RESPONSE=$(curl -s -X GET "$BASE_URL/api/$API_VERSION/payment/lookup?email=$ORDER_EMAIL")

echo "Order Details:"
echo "$LOOKUP_RESPONSE" | python3 -m json.tool 2>/dev/null | grep -A 20 "\"$ORDER_CODE\"" || echo "$LOOKUP_RESPONSE"
echo ""

# Extract task info
TASK_STATUS=$(echo "$LOOKUP_RESPONSE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")
TASK_ID=$(echo "$LOOKUP_RESPONSE" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2 || echo "")
DRIVE_LINK=$(echo "$LOOKUP_RESPONSE" | grep -o '"drive_link":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")

if [ -n "$TASK_ID" ]; then
  echo "Task Info:"
  echo "  Task ID: $TASK_ID"
  echo "  Status: $TASK_STATUS"
  echo "  Drive Link: ${DRIVE_LINK:-Not available}"
  echo ""
fi

# ============================================
# STEP 3: CHECK WORKER STATUS
# ============================================
echo -e "${BLUE}⚙️  STEP 3: Checking Worker Status...${NC}"
echo "----------------------------------------"

if command -v pm2 &> /dev/null; then
  echo "PM2 Worker Status:"
  pm2 list | grep -E "worker|udemy" || echo "  No worker processes found"
  echo ""
  
  echo "Recent Worker Logs (last 10 lines):"
  pm2 logs workers --lines 10 --nostream 2>/dev/null || echo "  Cannot access worker logs"
  echo ""
else
  echo "PM2 not found, skipping worker status check"
  echo ""
fi

# ============================================
# STEP 4: CHECK REDIS QUEUE (if accessible)
# ============================================
echo -e "${BLUE}📦 STEP 4: Checking Redis Queue...${NC}"
echo "----------------------------------------"

if command -v redis-cli &> /dev/null; then
  QUEUE_LENGTH=$(redis-cli LLEN download_queue 2>/dev/null || echo "N/A")
  echo "Queue Length: $QUEUE_LENGTH"
  
  if [ "$QUEUE_LENGTH" != "N/A" ] && [ "$QUEUE_LENGTH" != "0" ]; then
    echo "Jobs in queue:"
    redis-cli LRANGE download_queue 0 2 2>/dev/null || echo "  Cannot read queue"
  fi
  echo ""
else
  echo "Redis CLI not found, skipping queue check"
  echo ""
fi

# ============================================
# STEP 5: CHECK SERVER LOGS FOR DOWNLOAD ACTIVITY
# ============================================
echo -e "${BLUE}📝 STEP 5: Checking Server Logs...${NC}"
echo "----------------------------------------"

if [ -f "logs/backend-out.log" ]; then
  echo "Recent download-related logs:"
  grep -i "download\|task.*$TASK_ID\|order.*$ORDER_CODE" logs/backend-out.log | tail -5 || echo "  No relevant logs found"
  echo ""
fi

# ============================================
# STEP 6: TEST FINALIZE WEBHOOK (if task exists)
# ============================================
if [ -n "$TASK_ID" ] && [ "$TASK_STATUS" != "completed" ]; then
  echo -e "${BLUE}🔗 STEP 6: Testing Finalize Webhook...${NC}"
  echo "----------------------------------------"
  echo "Note: This will simulate task completion"
  echo "Press Ctrl+C to skip, or wait 3 seconds..."
  sleep 3
  
  # Load API_SECRET_KEY from .env
  if [ -f ".env" ]; then
    API_SECRET_KEY=$(grep "^API_SECRET_KEY=" .env 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" | tr -d ' ' || echo "")
  fi
  API_SECRET_KEY="${API_SECRET_KEY:-test-secret-key}"
  
  # Generate timestamp and signature
  TIMESTAMP=$(date +%s)
  FOLDER_NAME="Test-Course-Complete"
  MESSAGE="${TASK_ID}${FOLDER_NAME}${TIMESTAMP}"
  
  # Create HMAC signature (simplified - would need proper HMAC in real scenario)
  SIGNATURE=$(echo -n "$MESSAGE" | openssl dgst -sha256 -hmac "$API_SECRET_KEY" 2>/dev/null | cut -d' ' -f2 || echo "test-signature")
  
  echo "Calling finalize webhook..."
  echo "  Task ID: $TASK_ID"
  echo "  Folder: $FOLDER_NAME"
  echo ""
  
  FINALIZE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/$API_VERSION/webhook/finalize" \
    -H "Content-Type: application/json" \
    -H "X-Signature: $SIGNATURE" \
    -H "X-Timestamp: $TIMESTAMP" \
    -d "{
      \"task_id\": $TASK_ID,
      \"folder_name\": \"$FOLDER_NAME\",
      \"secret_key\": \"$API_SECRET_KEY\",
      \"timestamp\": $TIMESTAMP
    }")
  
  echo "Response:"
  echo "$FINALIZE_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$FINALIZE_RESPONSE"
  echo ""
  
  # Wait and check status again
  echo "Waiting 2 seconds and checking status..."
  sleep 2
  
  LOOKUP_RESPONSE=$(curl -s -X GET "$BASE_URL/api/$API_VERSION/payment/lookup?email=$ORDER_EMAIL")
  NEW_TASK_STATUS=$(echo "$LOOKUP_RESPONSE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")
  NEW_ORDER_STATUS=$(echo "$LOOKUP_RESPONSE" | grep -o "\"$ORDER_CODE\".*\"status\":\"[^\"]*\"" | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "")
  
  echo "Updated Status:"
  echo "  Task: $NEW_TASK_STATUS"
  echo "  Order: $NEW_ORDER_STATUS"
  echo ""
fi

# ============================================
# STEP 7: CHECK EMAIL CONFIGURATION
# ============================================
echo -e "${BLUE}📧 STEP 7: Checking Email Configuration...${NC}"
echo "----------------------------------------"

if [ -f ".env" ]; then
  EMAIL_USER=$(grep "^EMAIL_USER=" .env 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" || echo "")
  EMAIL_PASS=$(grep "^EMAIL_PASS=" .env 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" || echo "")
  
  if [ -n "$EMAIL_USER" ]; then
    echo "✅ Email configured: $EMAIL_USER"
    if [ -n "$EMAIL_PASS" ]; then
      echo "✅ Email password: Set"
    else
      echo "⚠️  Email password: Not set"
    fi
  else
    echo "❌ Email not configured (EMAIL_USER not set)"
  fi
else
  echo "⚠️  .env file not found"
fi
echo ""

# Check email logs
if [ -f "logs/backend-out.log" ]; then
  echo "Recent email-related logs:"
  grep -i "email\|send.*mail\|completion.*email" logs/backend-out.log | tail -5 || echo "  No email logs found"
  echo ""
fi

# ============================================
# SUMMARY
# ============================================
echo "=========================================="
echo "📋 SUMMARY"
echo "=========================================="
echo "Order Code: $ORDER_CODE"
echo "Payment Status: $PAYMENT_STATUS"
echo "Order Status: $ORDER_STATUS"
if [ -n "$TASK_ID" ]; then
  echo "Task ID: $TASK_ID"
  echo "Task Status: $TASK_STATUS"
  if [ -n "$DRIVE_LINK" ] && [ "$DRIVE_LINK" != "null" ]; then
    echo -e "${GREEN}✅ Drive Link: $DRIVE_LINK${NC}"
  else
    echo -e "${YELLOW}⚠️  Drive Link: Not available yet${NC}"
  fi
fi
echo ""

if [ "$ORDER_STATUS" = "completed" ]; then
  echo -e "${GREEN}✅ Order completed!${NC}"
elif [ "$ORDER_STATUS" = "processing" ]; then
  echo -e "${YELLOW}⏳ Order still processing...${NC}"
elif [ "$ORDER_STATUS" = "failed" ]; then
  echo -e "${RED}❌ Order failed!${NC}"
else
  echo -e "${YELLOW}⚠️  Order status: $ORDER_STATUS${NC}"
fi

echo "=========================================="
