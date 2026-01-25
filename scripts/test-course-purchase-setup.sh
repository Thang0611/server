#!/bin/bash

# Setup script for Course Purchase Feature tests
# This script runs migrations and then runs tests

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}=========================================="
echo "🧪 COURSE PURCHASE FEATURE TEST SETUP"
echo "==========================================${NC}"
echo ""

# Database configuration
DB_NAME="${DB_NAME:-khoahocgiare_db}"
DB_USER="${DB_USER:-root}"
DB_HOST="${DB_HOST:-localhost}"
MIGRATIONS_DIR="$(dirname "$0")/migrations"

# Step 1: Check if migrations need to be run
echo -e "${BLUE}Step 1: Checking database schema...${NC}"

# Check if course_type column exists
MYSQL_CHECK="mysql -h $DB_HOST -u $DB_USER -p$DB_PASSWORD $DB_NAME -e \"DESCRIBE download_tasks;\" 2>/dev/null | grep -q course_type || echo 'missing'"

if [ -z "$DB_PASSWORD" ]; then
    echo -e "${YELLOW}⚠️  DB_PASSWORD not set. You may need to enter password manually.${NC}"
    echo ""
    echo -e "${BLUE}Step 2: Running migrations...${NC}"
    echo ""
    
    # Run migration 1
    echo -e "${YELLOW}Running migration: add_course_type_and_category.sql${NC}"
    mysql -h "$DB_HOST" -u "$DB_USER" -p "$DB_NAME" < "$MIGRATIONS_DIR/add_course_type_and_category.sql" || {
        echo -e "${RED}❌ Migration 1 failed!${NC}"
        echo -e "${YELLOW}Note: If columns already exist, this is expected.${NC}"
    }
    
    # Run migration 2
    echo ""
    echo -e "${YELLOW}Running migration: create_courses_table.sql${NC}"
    mysql -h "$DB_HOST" -u "$DB_USER" -p "$DB_NAME" < "$MIGRATIONS_DIR/create_courses_table.sql" || {
        echo -e "${RED}❌ Migration 2 failed!${NC}"
        echo -e "${YELLOW}Note: If table already exists, this is expected.${NC}"
    }
else
    # With password
    echo -e "${YELLOW}Running migrations with password...${NC}"
    mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$MIGRATIONS_DIR/add_course_type_and_category.sql" 2>/dev/null || echo "Migration 1 may have already been run"
    mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$MIGRATIONS_DIR/create_courses_table.sql" 2>/dev/null || echo "Migration 2 may have already been run"
fi

echo ""
echo -e "${GREEN}✅ Migrations completed${NC}"
echo ""

# Step 3: Run tests
echo -e "${BLUE}Step 3: Running tests...${NC}"
echo ""

cd "$(dirname "$0")/.."
node scripts/test-course-purchase-feature.js

echo ""
echo -e "${CYAN}=========================================="
echo "✅ Test setup completed!"
echo "==========================================${NC}"
