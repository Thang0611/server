#!/bin/bash

###############################################################################
# PM2 Ecosystem Rollback Script
# Purpose: Rollback to systemd if PM2 Ecosystem has issues
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${RED}⚠️  ROLLBACK TO SYSTEMD MODE${NC}"
echo ""
echo "This will:"
echo "  1. Stop all PM2 processes"
echo "  2. Re-enable systemd service (udemy-worker-rq)"
echo "  3. Start the old worker service"
echo ""
read -p "Are you sure you want to rollback? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Rollback cancelled."
    exit 0
fi

echo ""
echo "=========================================="
echo "STEP 1: Stop PM2 Ecosystem"
echo "=========================================="

# Stop all PM2 processes
pm2 stop all || true
pm2 delete all || true

echo -e "${GREEN}✅${NC} PM2 processes stopped"

echo ""
echo "=========================================="
echo "STEP 2: Re-enable Systemd Service"
echo "=========================================="

# Enable and start systemd service
sudo systemctl enable udemy-worker-rq.service
sudo systemctl start udemy-worker-rq.service

echo -e "${GREEN}✅${NC} Systemd service started"

echo ""
echo "=========================================="
echo "STEP 3: Verify Rollback"
echo "=========================================="

# Check service status
sudo systemctl status udemy-worker-rq.service --no-pager

echo ""
echo -e "${GREEN}✅ Rollback completed!${NC}"
echo ""
echo "Systemd service is now running."
echo "Check status with: sudo systemctl status udemy-worker-rq"
