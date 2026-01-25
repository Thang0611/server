#!/bin/bash

# ============================================================================
# Backup Script for udemy_bot Database
# ============================================================================
# Usage: ./backup-udemy-bot.sh [backup_name]
# Example: ./backup-udemy-bot.sh before_migration_2026-01-15
# ============================================================================

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DB_NAME="udemy_bot"
BACKUP_DIR="/root/project/server/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="${1:-backup_${TIMESTAMP}}"
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_NAME}.sql"
BACKUP_COMPRESSED="${BACKUP_FILE}.gz"

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo -e "${GREEN}✅ Loaded environment variables${NC}"
else
    echo -e "${RED}❌ .env file not found${NC}"
    exit 1
fi

# Check required environment variables
if [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_HOST" ]; then
    echo -e "${RED}❌ Missing required database environment variables${NC}"
    echo "Required: DB_USER, DB_PASSWORD, DB_HOST"
    exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo -e "${BLUE}🗄️  Database Backup Script${NC}"
echo ""
echo -e "${BLUE}📋 Configuration:${NC}"
echo "   Database: $DB_NAME"
echo "   User: $DB_USER"
echo "   Host: $DB_HOST"
echo "   Backup Name: $BACKUP_NAME"
echo "   Backup File: $BACKUP_FILE"
echo ""

# Check if database exists
echo -e "${BLUE}🔍 Checking if database exists...${NC}"
DB_EXISTS=$(mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" -e "SHOW DATABASES LIKE '$DB_NAME';" | grep -c "$DB_NAME" || true)

if [ "$DB_EXISTS" -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Database '$DB_NAME' does not exist yet${NC}"
    echo -e "${YELLOW}   This will create a backup after migration${NC}"
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 1
    fi
else
    echo -e "${GREEN}✅ Database '$DB_NAME' exists${NC}"
fi

# Create backup
echo ""
echo -e "${BLUE}📦 Creating backup...${NC}"
mysqldump -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" \
    --single-transaction \
    --routines \
    --triggers \
    --events \
    --add-drop-database \
    --databases "$DB_NAME" > "$BACKUP_FILE" 2>/dev/null

if [ $? -eq 0 ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}✅ Backup created successfully!${NC}"
    echo "   Size: $BACKUP_SIZE"
    echo "   File: $BACKUP_FILE"
    
    # Compress backup
    echo ""
    echo -e "${BLUE}🗜️  Compressing backup...${NC}"
    gzip -f "$BACKUP_FILE"
    
    if [ $? -eq 0 ]; then
        COMPRESSED_SIZE=$(du -h "$BACKUP_COMPRESSED" | cut -f1)
        echo -e "${GREEN}✅ Backup compressed successfully!${NC}"
        echo "   Compressed Size: $COMPRESSED_SIZE"
        echo "   File: $BACKUP_COMPRESSED"
        
        # Create backup info file
        INFO_FILE="${BACKUP_DIR}/${BACKUP_NAME}.info"
        cat > "$INFO_FILE" << EOF
Backup Information
==================
Database: $DB_NAME
Backup Name: $BACKUP_NAME
Timestamp: $TIMESTAMP
Date: $(date +"%Y-%m-%d %H:%M:%S")
Size: $COMPRESSED_SIZE
File: $BACKUP_COMPRESSED

Restore Command:
----------------
gunzip < $BACKUP_COMPRESSED | mysql -h $DB_HOST -u $DB_USER -p$DB_PASSWORD $DB_NAME

Or:
zcat $BACKUP_COMPRESSED | mysql -h $DB_HOST -u $DB_USER -p$DB_PASSWORD $DB_NAME
EOF
        
        echo ""
        echo -e "${GREEN}✨ Backup completed!${NC}"
        echo ""
        echo -e "${BLUE}📄 Backup Info:${NC}"
        echo "   Info File: $INFO_FILE"
        echo "   Backup File: $BACKUP_COMPRESSED"
        echo ""
        echo -e "${BLUE}🔄 To restore:${NC}"
        echo "   gunzip < $BACKUP_COMPRESSED | mysql -h $DB_HOST -u $DB_USER -p$DB_PASSWORD $DB_NAME"
    else
        echo -e "${RED}❌ Compression failed${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ Backup failed${NC}"
    exit 1
fi
