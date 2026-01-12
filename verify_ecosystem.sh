#!/bin/bash

###############################################################################
# PM2 Ecosystem Verification Script
# Purpose: Verify that all services are running correctly
###############################################################################

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo ""
    echo "=========================================="
    echo "$1"
    echo "=========================================="
}

check_status() {
    local name=$1
    local expected_instances=$2
    
    if pm2 list | grep -q "$name"; then
        local status=$(pm2 jlist | jq -r ".[] | select(.name == \"$name\") | .pm2_env.status" | head -1)
        local actual_instances=$(pm2 jlist | jq "[.[] | select(.name == \"$name\")] | length")
        
        if [ "$status" == "online" ]; then
            echo -e "${GREEN}✅${NC} $name: ONLINE ($actual_instances instances)"
            return 0
        else
            echo -e "${RED}❌${NC} $name: $status"
            return 1
        fi
    else
        echo -e "${RED}❌${NC} $name: NOT FOUND"
        return 1
    fi
}

###############################################################################
# Main Verification
###############################################################################

print_header "PM2 Ecosystem Health Check"

echo "Checking all services..."
echo ""

ALL_OK=true

# Check Backend
check_status "backend" 2 || ALL_OK=false

# Check Next.js
check_status "client-nextjs" 1 || ALL_OK=false

# Check Workers
check_status "udemy-dl-workers" 5 || ALL_OK=false

echo ""
print_header "Redis Connection Check"

# Check Redis connectivity
if redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC} Redis: Connected"
else
    echo -e "${RED}❌${NC} Redis: Cannot connect"
    ALL_OK=false
fi

# Check queue length
QUEUE_LEN=$(redis-cli LLEN rq:queue:downloads 2>/dev/null || echo "error")
if [ "$QUEUE_LEN" != "error" ]; then
    echo -e "${BLUE}ℹ${NC}  Queue Length: $QUEUE_LEN pending jobs"
else
    echo -e "${RED}❌${NC} Cannot check queue length"
fi

echo ""
print_header "Process Details"

pm2 list

echo ""
print_header "Memory Usage"

pm2 list | awk 'NR>3 {print $2, $10}'

echo ""
print_header "Recent Logs (Last 10 lines)"

echo ""
echo "=== Backend Logs ==="
pm2 logs backend --lines 5 --nostream 2>/dev/null || echo "No logs available"

echo ""
echo "=== Worker Logs ==="
pm2 logs udemy-dl-workers --lines 5 --nostream 2>/dev/null || echo "No logs available"

echo ""
print_header "System Summary"

if [ "$ALL_OK" = true ]; then
    echo -e "${GREEN}✅ ALL SYSTEMS OPERATIONAL${NC}"
    echo ""
    echo "Your PM2 Ecosystem is healthy!"
    exit 0
else
    echo -e "${RED}⚠️  SOME ISSUES DETECTED${NC}"
    echo ""
    echo "Please check the logs with: pm2 logs"
    exit 1
fi
