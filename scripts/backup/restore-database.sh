#!/bin/bash

##############################################################################
# Database Restore Script
# Restore MySQL database từ backup file
# 
# Usage:
#   ./restore-database.sh <backup-file>
#
# Example:
#   ./restore-database.sh backup/database/2026-01-18_10-30-00_database.sql.gz
##############################################################################

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load environment variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo -e "${GREEN}✅ Loaded environment variables${NC}"
else
    echo -e "${RED}❌ .env file not found${NC}"
    exit 1
fi

# Check arguments
if [ -z "$1" ]; then
    echo -e "${RED}❌ Usage: $0 <backup-file>${NC}"
    echo ""
    echo "Available backups:"
    ls -lh backup/database/*.sql* 2>/dev/null | tail -10 || echo "   No backups found"
    exit 1
fi

BACKUP_FILE="$1"

# Check if file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}❌ Backup file not found: $BACKUP_FILE${NC}"
    exit 1
fi

# Check required variables
if [ -z "$DB_NAME" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_HOST" ]; then
    echo -e "${RED}❌ Missing required database environment variables${NC}"
    exit 1
fi

echo -e "${BLUE}🔄 Database Restore Script${NC}"
echo ""
echo -e "${BLUE}📋 Configuration:${NC}"
echo "   Database: $DB_NAME"
echo "   Host: $DB_HOST"
echo "   User: $DB_USER"
echo "   Backup File: $BACKUP_FILE"
echo ""

# Warning
echo -e "${RED}⚠️  WARNING: This will REPLACE all data in database '$DB_NAME'${NC}"
echo -e "${RED}⚠️  Make sure you have a backup before proceeding!${NC}"
echo ""
read -p "Are you sure you want to continue? (type 'yes' to confirm): " -r
echo
if [[ ! $REPLY == "yes" ]]; then
    echo "Restore cancelled."
    exit 1
fi

# Check if database exists
echo -e "${BLUE}🔍 Checking database...${NC}"
DB_EXISTS=$(mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" -e "SHOW DATABASES LIKE '$DB_NAME';" | grep -c "$DB_NAME" || true)

if [ "$DB_EXISTS" -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Database '$DB_NAME' does not exist. Creating...${NC}"
    mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    echo -e "${GREEN}✅ Database created${NC}"
fi

# Restore backup
echo -e "${BLUE}📦 Restoring backup...${NC}"

if [[ "$BACKUP_FILE" == *.gz ]]; then
    # Compressed backup
    echo "   Decompressing and restoring..."
    gunzip -c "$BACKUP_FILE" | mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"
else
    # Uncompressed backup
    mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$BACKUP_FILE"
fi

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database restored successfully!${NC}"
    echo ""
    echo -e "${BLUE}📊 Verifying restore...${NC}"
    
    # Check tables
    TABLE_COUNT=$(mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SHOW TABLES;" | wc -l)
    echo "   Tables found: $((TABLE_COUNT - 1))"
    
    # Check orders count
    ORDER_COUNT=$(mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SELECT COUNT(*) FROM orders;" 2>/dev/null | tail -1 || echo "0")
    echo "   Orders: $ORDER_COUNT"
    
    # Check tasks count
    TASK_COUNT=$(mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SELECT COUNT(*) FROM download_tasks;" 2>/dev/null | tail -1 || echo "0")
    echo "   Tasks: $TASK_COUNT"
    
    echo ""
    echo -e "${GREEN}✨ Restore completed!${NC}"
else
    echo -e "${RED}❌ Restore failed!${NC}"
    exit 1
fi
