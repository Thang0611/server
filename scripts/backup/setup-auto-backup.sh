#!/bin/bash

##############################################################################
# Setup Automated Backup với Cron
# Tự động backup database và server files theo lịch
# 
# Usage:
#   ./setup-auto-backup.sh [--daily] [--hourly] [--weekly]
#
# Default: Daily backup at 2:00 AM
##############################################################################

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

BACKUP_SCHEDULE="daily"  # daily, hourly, weekly

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --daily)
            BACKUP_SCHEDULE="daily"
            shift
            ;;
        --hourly)
            BACKUP_SCHEDULE="hourly"
            shift
            ;;
        --weekly)
            BACKUP_SCHEDULE="weekly"
            shift
            ;;
        *)
            echo -e "${YELLOW}Unknown option: $1${NC}"
            shift
            ;;
    esac
done

echo -e "${BLUE}⚙️  Setup Automated Backup${NC}"
echo ""
echo -e "${BLUE}📋 Configuration:${NC}"
echo "   Schedule: $BACKUP_SCHEDULE"
echo "   Script Directory: $SCRIPT_DIR"
echo ""

# Create cron job
CRON_JOB=""

case $BACKUP_SCHEDULE in
    daily)
        # Daily at 2:00 AM
        CRON_JOB="0 2 * * * cd $PROJECT_ROOT && $SCRIPT_DIR/backup-full.sh --compress --exclude-logs --exclude-node-modules >> $PROJECT_ROOT/logs/backup.log 2>&1"
        ;;
    hourly)
        # Every hour
        CRON_JOB="0 * * * * cd $PROJECT_ROOT && $SCRIPT_DIR/backup-full.sh --compress --exclude-logs --exclude-node-modules >> $PROJECT_ROOT/logs/backup.log 2>&1"
        ;;
    weekly)
        # Every Sunday at 2:00 AM
        CRON_JOB="0 2 * * 0 cd $PROJECT_ROOT && $SCRIPT_DIR/backup-full.sh --compress --exclude-logs --exclude-node-modules >> $PROJECT_ROOT/logs/backup.log 2>&1"
        ;;
esac

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "backup-full.sh"; then
    echo -e "${YELLOW}⚠️  Backup cron job already exists${NC}"
    read -p "Replace existing cron job? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Remove existing backup cron jobs
        crontab -l 2>/dev/null | grep -v "backup-full.sh" | crontab -
        echo -e "${GREEN}✅ Removed existing backup cron job${NC}"
    else
        echo "Cancelled."
        exit 0
    fi
fi

# Add new cron job
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Automated backup configured!${NC}"
    echo ""
    echo -e "${BLUE}📋 Cron Job:${NC}"
    echo "   $CRON_JOB"
    echo ""
    echo -e "${BLUE}📋 Current Cron Jobs:${NC}"
    crontab -l | grep -E "(backup|BACKUP)" || echo "   (none)"
    echo ""
    echo -e "${YELLOW}💡 Tip: View backup logs at: logs/backup.log${NC}"
else
    echo -e "${RED}❌ Failed to setup automated backup${NC}"
    exit 1
fi
