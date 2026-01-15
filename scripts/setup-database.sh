#!/bin/bash

# Database Setup Script
# Tạo lại toàn bộ database từ SQL schema

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🗄️  Database Setup Script${NC}"
echo ""

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo -e "${GREEN}✅ Loaded environment variables${NC}"
else
    echo -e "${RED}❌ .env file not found${NC}"
    exit 1
fi

# Check required environment variables
if [ -z "$DB_NAME" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_HOST" ]; then
    echo -e "${RED}❌ Missing required database environment variables${NC}"
    echo "Required: DB_NAME, DB_USER, DB_PASSWORD, DB_HOST"
    exit 1
fi

echo -e "${BLUE}📋 Database Configuration:${NC}"
echo "   Database: $DB_NAME"
echo "   User: $DB_USER"
echo "   Host: $DB_HOST"
echo ""

# Confirm before proceeding
read -p "⚠️  This will DROP all existing tables. Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 1
fi

# Run SQL script
echo -e "${BLUE}🔧 Creating database schema...${NC}"
mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < scripts/migrations/create_all_tables.sql

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Database schema created successfully!${NC}"
    echo ""
    echo -e "${BLUE}📊 Tables created:${NC}"
    echo "   - orders"
    echo "   - download_tasks"
    echo "   - order_audit_logs"
    echo ""
    echo -e "${BLUE}📈 Views created:${NC}"
    echo "   - v_order_latest_events"
    echo "   - v_order_errors"
    echo ""
    echo -e "${BLUE}⚙️  Stored procedures created:${NC}"
    echo "   - sp_log_audit_event"
    echo ""
    echo -e "${GREEN}✨ Setup completed!${NC}"
else
    echo -e "${RED}❌ Database setup failed${NC}"
    exit 1
fi
