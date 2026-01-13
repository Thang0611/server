#!/bin/bash

# Test script for infoCourse improvements
# This script tests the retry mechanism and rate limiting

echo "=========================================="
echo "Testing infoCourse.service improvements"
echo "=========================================="
echo ""

BASE_URL="http://localhost:3000"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Single valid course
echo -e "${YELLOW}Test 1: Single valid course${NC}"
curl -s -X POST "${BASE_URL}/api/v1/infocourse" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["https://udemy.com/course/designing-ai-assistants/"]
  }' | jq '.'
echo ""
echo "---"
echo ""

# Test 2: Multiple courses (rate limiting test)
echo -e "${YELLOW}Test 2: Multiple courses (rate limiting)${NC}"
curl -s -X POST "${BASE_URL}/api/v1/infocourse" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://udemy.com/course/designing-ai-assistants/",
      "https://udemy.com/course/python-for-beginners/",
      "https://udemy.com/course/web-development/",
      "https://udemy.com/course/data-science/"
    ]
  }' | jq '.'
echo ""
echo "---"
echo ""

# Test 3: Invalid URL (should fail fast without retry)
echo -e "${YELLOW}Test 3: Invalid URL (no retry expected)${NC}"
curl -s -X POST "${BASE_URL}/api/v1/infocourse" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["https://udemy.com/invalid-url-that-does-not-exist/"]
  }' | jq '.'
echo ""
echo "---"
echo ""

# Test 4: Mixed valid and invalid
echo -e "${YELLOW}Test 4: Mixed valid and invalid URLs${NC}"
curl -s -X POST "${BASE_URL}/api/v1/infocourse" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://udemy.com/course/designing-ai-assistants/",
      "https://invalid.com/course/fake/",
      "https://udemy.com/course/python-for-beginners/"
    ]
  }' | jq '.'
echo ""

echo ""
echo "=========================================="
echo -e "${GREEN}Testing completed!${NC}"
echo "=========================================="
echo ""
echo "Check logs for retry behavior:"
echo "  tail -f logs/backend-out.log | grep -i 'retry\\|attempt\\|crawl'"
