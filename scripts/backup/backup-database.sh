#!/bin/bash

##############################################################################
# Database Backup Script
# Backup MySQL database với compression và rotation
# 
# Usage:
#   ./backup-database.sh [--full] [--compress]
#
# Options:
#   --full      : Full backup (bao gồm cả structure và data)
#   --compress  : Nén backup file (gzip)
#
# Output:
#   backup/database/YYYY-MM-DD_HH-MM-SS_database.sql[.gz]
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

# Check required variables
if [ -z "$DB_NAME" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_HOST" ]; then
    echo -e "${RED}❌ Missing required database environment variables${NC}"
    echo "Required: DB_NAME, DB_USER, DB_PASSWORD, DB_HOST"
    exit 1
fi

# Configuration
BACKUP_DIR="$PROJECT_ROOT/backup/database"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="$BACKUP_DIR/${TIMESTAMP}_${DB_NAME}.sql"
KEEP_DAYS=${BACKUP_KEEP_DAYS:-30}  # Giữ backup trong 30 ngày (có thể config trong .env)
COMPRESS=false
FULL_BACKUP=true

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --compress)
            COMPRESS=true
            shift
            ;;
        --full)
            FULL_BACKUP=true
            shift
            ;;
        *)
            echo -e "${YELLOW}Unknown option: $1${NC}"
            shift
            ;;
    esac
done

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo -e "${BLUE}🗄️  Database Backup Script${NC}"
echo ""
echo -e "${BLUE}📋 Configuration:${NC}"
echo "   Database: $DB_NAME"
echo "   Host: $DB_HOST"
echo "   User: $DB_USER"
echo "   Backup File: $BACKUP_FILE"
echo "   Keep Days: $KEEP_DAYS"
echo "   Compress: $COMPRESS"
echo ""

# Perform backup
echo -e "${BLUE}📦 Creating backup...${NC}"

if [ "$FULL_BACKUP" = true ]; then
    # Full backup: Structure + Data
    # --skip-triggers: Bỏ qua triggers nếu không có quyền
    # --skip-routines: Bỏ qua stored procedures nếu không có quyền
    mysqldump -h "$DB_HOST" \
              -u "$DB_USER" \
              -p"$DB_PASSWORD" \
              --single-transaction \
              --quick \
              --lock-tables=false \
              --skip-triggers \
              --skip-routines \
              --skip-events \
              "$DB_NAME" > "$BACKUP_FILE" 2>/dev/null || \
    # Fallback: Nếu vẫn lỗi, thử backup không có các options trên
    mysqldump -h "$DB_HOST" \
              -u "$DB_USER" \
              -p"$DB_PASSWORD" \
              --single-transaction \
              --quick \
              --lock-tables=false \
              "$DB_NAME" > "$BACKUP_FILE"
else
    # Data only (structure đã có trong migration files)
    mysqldump -h "$DB_HOST" \
              -u "$DB_USER" \
              -p"$DB_PASSWORD" \
              --single-transaction \
              --no-create-info \
              --quick \
              --lock-tables=false \
              "$DB_NAME" > "$BACKUP_FILE"
fi

if [ $? -eq 0 ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}✅ Backup created successfully!${NC}"
    echo "   Size: $BACKUP_SIZE"
    
    # Compress if requested
    if [ "$COMPRESS" = true ]; then
        echo -e "${BLUE}🗜️  Compressing backup...${NC}"
        gzip "$BACKUP_FILE"
        BACKUP_FILE="${BACKUP_FILE}.gz"
        BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        echo -e "${GREEN}✅ Backup compressed!${NC}"
        echo "   Compressed Size: $BACKUP_SIZE"
    fi
    
    # Clean old backups
    echo -e "${BLUE}🧹 Cleaning old backups (older than $KEEP_DAYS days)...${NC}"
    find "$BACKUP_DIR" -name "*.sql" -mtime +$KEEP_DAYS -delete 2>/dev/null || true
    find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$KEEP_DAYS -delete 2>/dev/null || true
    echo -e "${GREEN}✅ Old backups cleaned${NC}"
    
    echo ""
    echo -e "${GREEN}✨ Backup completed!${NC}"
    echo "   File: $BACKUP_FILE"
    echo "   Size: $BACKUP_SIZE"
else
    echo -e "${RED}❌ Backup failed!${NC}"
    rm -f "$BACKUP_FILE"
    exit 1
fi
