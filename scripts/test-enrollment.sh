#!/bin/bash

# Test enrollment functionality
echo "=========================================="
echo "Testing Enrollment Functionality"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test course URL (replace with actual course)
TEST_URL="https://samsungu.udemy.com/course/designing-ai-assistants/"

echo -e "${YELLOW}1. Checking UDEMY_TOKEN...${NC}"
if [ -z "$UDEMY_TOKEN" ]; then
    # Load from .env
    export $(cat /root/server/.env | grep UDEMY_TOKEN | xargs)
fi

if [ -z "$UDEMY_TOKEN" ]; then
    echo -e "${RED}❌ UDEMY_TOKEN not found${NC}"
    exit 1
else
    echo -e "${GREEN}✅ UDEMY_TOKEN found${NC}"
fi

echo ""
echo -e "${YELLOW}2. Testing enrollment function...${NC}"
cd /root/server/udemy_dl

# Create test script
cat > /tmp/test_enroll.py << 'PYEOF'
import sys
import os
sys.path.insert(0, '/root/server/udemy_dl')
from worker_rq import enroll_course, get_course_id_from_url

test_url = sys.argv[1] if len(sys.argv) > 1 else "https://samsungu.udemy.com/course/test/"

print(f"Testing enrollment for: {test_url}")
print(f"Course slug: {get_course_id_from_url(test_url)}")
print("")

result = enroll_course(test_url, 999)

if result:
    print("✅ ENROLLMENT TEST PASSED")
    sys.exit(0)
else:
    print("❌ ENROLLMENT TEST FAILED")
    sys.exit(1)
PYEOF

python3 /tmp/test_enroll.py "$TEST_URL"
EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ Test PASSED - Enrollment working!${NC}"
else
    echo -e "${RED}❌ Test FAILED - Check logs above${NC}"
fi

echo ""
echo "=========================================="
echo "Check worker logs:"
echo "  tail -f /root/server/logs/worker-out.log | grep -i enroll"
echo "=========================================="

exit $EXIT_CODE
