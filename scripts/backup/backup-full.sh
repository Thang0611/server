#!/bin/bash

##############################################################################
# Full Backup Script
# Backup cả database và server files
# 
# Usage:
#   ./backup-full.sh [--compress] [--exclude-logs] [--exclude-node-modules]
#
# Output:
#   backup/database/YYYY-MM-DD_HH-MM-SS_database.sql[.gz]
#   backup/server/YYYY-MM-DD_HH-MM-SS_server.tar.gz
##############################################################################

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}🔄 Full Backup Script${NC}"
echo ""

# Backup database
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📦 Step 1: Backup Database${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
"$SCRIPT_DIR/backup-database.sh" --full --compress

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📦 Step 2: Backup Server Files${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
"$SCRIPT_DIR/backup-server.sh" --exclude-logs --exclude-node-modules

echo ""
echo -e "${GREEN}✨ Full backup completed!${NC}"
echo ""
echo -e "${BLUE}📋 Backup Summary:${NC}"
echo "   Database: backup/database/"
echo "   Server: backup/server/"
echo ""
echo -e "${YELLOW}💡 Tip: Copy backups to external storage or cloud for safety${NC}"
