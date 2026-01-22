#!/bin/bash

##############################################################################
# Upload Backups to Cloud Storage
# Upload latest backups to Google Drive (rclone) hoặc AWS S3
# 
# Usage:
#   ./upload-to-cloud.sh [--provider=gdrive|s3] [--remote-name=remote_name]
#
# Requirements:
#   - rclone configured (for Google Drive)
#   - AWS CLI configured (for S3)
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
cd "$PROJECT_ROOT"

BACKUP_DIR="$PROJECT_ROOT/backup"
PROVIDER="gdrive"  # gdrive or s3
REMOTE_NAME="gdrive"  # rclone remote name
S3_BUCKET=""  # S3 bucket name (if using S3)

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --provider=*)
            PROVIDER="${1#*=}"
            shift
            ;;
        --remote-name=*)
            REMOTE_NAME="${1#*=}"
            shift
            ;;
        --s3-bucket=*)
            S3_BUCKET="${1#*=}"
            shift
            ;;
        *)
            echo -e "${YELLOW}Unknown option: $1${NC}"
            shift
            ;;
    esac
done

echo -e "${BLUE}☁️  Upload Backups to Cloud${NC}"
echo ""
echo -e "${BLUE}📋 Configuration:${NC}"
echo "   Provider: $PROVIDER"
echo "   Backup Directory: $BACKUP_DIR"
echo ""

# Get latest backups
LATEST_DB=$(ls -t "$BACKUP_DIR/database"/*.sql.gz 2>/dev/null | head -1 || echo "")
LATEST_SERVER=$(ls -t "$BACKUP_DIR/server"/*.tar.gz 2>/dev/null | head -1 || echo "")

if [ -z "$LATEST_DB" ] && [ -z "$LATEST_SERVER" ]; then
    echo -e "${RED}❌ No backups found!${NC}"
    exit 1
fi

# Upload to Google Drive (rclone)
if [ "$PROVIDER" = "gdrive" ]; then
    # Check if rclone is installed
    if ! command -v rclone &> /dev/null; then
        echo -e "${RED}❌ rclone not found. Install: sudo apt install rclone${NC}"
        exit 1
    fi
    
    # Check if remote exists
    if ! rclone listremotes | grep -q "^${REMOTE_NAME}:"; then
        echo -e "${RED}❌ rclone remote '$REMOTE_NAME' not found${NC}"
        echo "   Setup: rclone config"
        exit 1
    fi
    
    echo -e "${BLUE}📤 Uploading to Google Drive...${NC}"
    
    if [ -n "$LATEST_DB" ]; then
        echo "   Database: $(basename $LATEST_DB)"
        rclone copy "$LATEST_DB" "${REMOTE_NAME}:backups/getcourses/database/" -P
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}   ✅ Database backup uploaded${NC}"
        else
            echo -e "${RED}   ❌ Database backup upload failed${NC}"
        fi
    fi
    
    if [ -n "$LATEST_SERVER" ]; then
        echo "   Server: $(basename $LATEST_SERVER)"
        rclone copy "$LATEST_SERVER" "${REMOTE_NAME}:backups/getcourses/server/" -P
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}   ✅ Server backup uploaded${NC}"
        else
            echo -e "${RED}   ❌ Server backup upload failed${NC}"
        fi
    fi

# Upload to AWS S3
elif [ "$PROVIDER" = "s3" ]; then
    # Check if AWS CLI is installed
    if ! command -v aws &> /dev/null; then
        echo -e "${RED}❌ AWS CLI not found. Install: sudo apt install awscli${NC}"
        exit 1
    fi
    
    if [ -z "$S3_BUCKET" ]; then
        echo -e "${RED}❌ S3 bucket not specified. Use --s3-bucket=bucket-name${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}📤 Uploading to AWS S3...${NC}"
    
    if [ -n "$LATEST_DB" ]; then
        echo "   Database: $(basename $LATEST_DB)"
        aws s3 cp "$LATEST_DB" "s3://${S3_BUCKET}/backups/getcourses/database/" --quiet
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}   ✅ Database backup uploaded${NC}"
        else
            echo -e "${RED}   ❌ Database backup upload failed${NC}"
        fi
    fi
    
    if [ -n "$LATEST_SERVER" ]; then
        echo "   Server: $(basename $LATEST_SERVER)"
        aws s3 cp "$LATEST_SERVER" "s3://${S3_BUCKET}/backups/getcourses/server/" --quiet
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}   ✅ Server backup uploaded${NC}"
        else
            echo -e "${RED}   ❌ Server backup upload failed${NC}"
        fi
    fi
else
    echo -e "${RED}❌ Unknown provider: $PROVIDER${NC}"
    echo "   Supported: gdrive, s3"
    exit 1
fi

echo ""
echo -e "${GREEN}✨ Upload completed!${NC}"
