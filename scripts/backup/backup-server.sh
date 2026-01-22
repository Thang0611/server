#!/bin/bash

##############################################################################
# Server Backup Script
# Backup code, config files, và các files quan trọng
# 
# Usage:
#   ./backup-server.sh [--exclude-logs] [--exclude-node-modules]
#
# Options:
#   --exclude-logs         : Không backup logs
#   --exclude-node-modules : Không backup node_modules (có thể npm install lại)
#
# Output:
#   backup/server/YYYY-MM-DD_HH-MM-SS_server.tar.gz
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
cd "$PROJECT_ROOT"

# Configuration
BACKUP_DIR="$PROJECT_ROOT/backup/server"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="$BACKUP_DIR/${TIMESTAMP}_server.tar.gz"
KEEP_DAYS=${BACKUP_KEEP_DAYS:-30}
EXCLUDE_LOGS=false
EXCLUDE_NODE_MODULES=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --exclude-logs)
            EXCLUDE_LOGS=true
            shift
            ;;
        --exclude-node-modules)
            EXCLUDE_NODE_MODULES=true
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

echo -e "${BLUE}💾 Server Backup Script${NC}"
echo ""
echo -e "${BLUE}📋 Configuration:${NC}"
echo "   Project Root: $PROJECT_ROOT"
echo "   Backup File: $BACKUP_FILE"
echo "   Keep Days: $KEEP_DAYS"
echo "   Exclude Logs: $EXCLUDE_LOGS"
echo "   Exclude node_modules: $EXCLUDE_NODE_MODULES"
echo ""

# Build exclude patterns
EXCLUDE_PATTERNS=(
    "--exclude=backup"
    "--exclude=.git"
    "--exclude=.env.local"
    "--exclude=*.log"
    "--exclude=Staging_Download"
    "--exclude=_archive"
    "--exclude=_deprecated_backup"
)

if [ "$EXCLUDE_LOGS" = true ]; then
    EXCLUDE_PATTERNS+=("--exclude=logs")
fi

if [ "$EXCLUDE_NODE_MODULES" = true ]; then
    EXCLUDE_PATTERNS+=("--exclude=node_modules")
    EXCLUDE_PATTERNS+=("--exclude=udemy_dl/__pycache__")
fi

# Files/Folders to backup
BACKUP_ITEMS=(
    "src"
    "scripts"
    "udemy_dl"
    "server.js"
    "package.json"
    "package-lock.json"
    "ecosystem.config.js"
    ".env"
    "nginx-getcourses.conf"
    "nginx-config.conf"
    "cookies.txt"
    "service-account.json"
    "postman"
    "docs"
    "*.md"
)

echo -e "${BLUE}📦 Creating backup...${NC}"

# Create tar archive
tar -czf "$BACKUP_FILE" \
    "${EXCLUDE_PATTERNS[@]}" \
    -C "$PROJECT_ROOT" \
    "${BACKUP_ITEMS[@]}" 2>/dev/null || {
    # Fallback: backup từng item nếu có lỗi
    echo -e "${YELLOW}⚠️  Using fallback backup method...${NC}"
    TEMP_DIR=$(mktemp -d)
    for item in "${BACKUP_ITEMS[@]}"; do
        if [ -e "$PROJECT_ROOT/$item" ]; then
            cp -r "$PROJECT_ROOT/$item" "$TEMP_DIR/" 2>/dev/null || true
        fi
    done
    tar -czf "$BACKUP_FILE" \
        "${EXCLUDE_PATTERNS[@]}" \
        -C "$TEMP_DIR" .
    rm -rf "$TEMP_DIR"
}

if [ $? -eq 0 ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}✅ Backup created successfully!${NC}"
    echo "   Size: $BACKUP_SIZE"
    
    # Clean old backups
    echo -e "${BLUE}🧹 Cleaning old backups (older than $KEEP_DAYS days)...${NC}"
    find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$KEEP_DAYS -delete 2>/dev/null || true
    echo -e "${GREEN}✅ Old backups cleaned${NC}"
    
    echo ""
    echo -e "${GREEN}✨ Backup completed!${NC}"
    echo "   File: $BACKUP_FILE"
    echo "   Size: $BACKUP_SIZE"
    
    # List contents
    echo ""
    echo -e "${BLUE}📋 Backup contents:${NC}"
    tar -tzf "$BACKUP_FILE" | head -20
    echo "..."
else
    echo -e "${RED}❌ Backup failed!${NC}"
    rm -f "$BACKUP_FILE"
    exit 1
fi
