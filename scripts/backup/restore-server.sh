#!/bin/bash

##############################################################################
# Server Restore Script
# Restore server files từ backup archive
# 
# Usage:
#   ./restore-server.sh <backup-file> [--target-dir=/path/to/restore]
#
# Example:
#   ./restore-server.sh backup/server/2026-01-18_10-30-00_server.tar.gz
##############################################################################

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Check arguments
if [ -z "$1" ]; then
    echo -e "${RED}❌ Usage: $0 <backup-file> [--target-dir=/path/to/restore]${NC}"
    echo ""
    echo "Available backups:"
    ls -lh backup/server/*.tar.gz 2>/dev/null | tail -10 || echo "   No backups found"
    exit 1
fi

BACKUP_FILE="$1"
TARGET_DIR="$PROJECT_ROOT"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --target-dir=*)
            TARGET_DIR="${1#*=}"
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# Check if file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}❌ Backup file not found: $BACKUP_FILE${NC}"
    exit 1
fi

echo -e "${BLUE}🔄 Server Restore Script${NC}"
echo ""
echo -e "${BLUE}📋 Configuration:${NC}"
echo "   Backup File: $BACKUP_FILE"
echo "   Target Directory: $TARGET_DIR"
echo ""

# Warning
echo -e "${RED}⚠️  WARNING: This will REPLACE files in target directory${NC}"
echo -e "${RED}⚠️  Make sure you have a backup before proceeding!${NC}"
echo ""
read -p "Are you sure you want to continue? (type 'yes' to confirm): " -r
echo
if [[ ! $REPLY == "yes" ]]; then
    echo "Restore cancelled."
    exit 1
fi

# Create target directory if not exists
mkdir -p "$TARGET_DIR"

# Extract backup
echo -e "${BLUE}📦 Extracting backup...${NC}"
tar -xzf "$BACKUP_FILE" -C "$TARGET_DIR"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Server files restored successfully!${NC}"
    echo ""
    echo -e "${BLUE}📋 Next steps:${NC}"
    echo "   1. Review restored files"
    echo "   2. Install dependencies: npm install"
    echo "   3. Install Python dependencies if needed"
    echo "   4. Update .env file with correct values"
    echo "   5. Restart services: pm2 restart all"
    echo ""
    echo -e "${GREEN}✨ Restore completed!${NC}"
else
    echo -e "${RED}❌ Restore failed!${NC}"
    exit 1
fi
