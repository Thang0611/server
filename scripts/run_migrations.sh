#!/bin/bash

# ============================================================================
# Script to run database migrations
# Usage: ./run_migrations.sh [migration_file.sql]
# ============================================================================

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Database configuration (adjust as needed)
DB_NAME="${DB_NAME:-khoahocgiare_db}"
DB_USER="${DB_USER:-root}"
DB_HOST="${DB_HOST:-localhost}"

# Migration directory
MIGRATIONS_DIR="$(dirname "$0")/migrations"

echo -e "${YELLOW}Database Migrations Runner${NC}"
echo "=================================="
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo "Host: $DB_HOST"
echo ""

# If specific migration file provided, run only that
if [ -n "$1" ]; then
    MIGRATION_FILE="$1"
    if [ ! -f "$MIGRATION_FILE" ]; then
        echo -e "${RED}Error: Migration file not found: $MIGRATION_FILE${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}Running migration: $MIGRATION_FILE${NC}"
    mysql -h "$DB_HOST" -u "$DB_USER" -p "$DB_NAME" < "$MIGRATION_FILE"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Migration completed successfully!${NC}"
    else
        echo -e "${RED}❌ Migration failed!${NC}"
        exit 1
    fi
    exit 0
fi

# Otherwise, show available migrations
echo -e "${YELLOW}Available migrations:${NC}"
echo ""

MIGRATIONS=(
    "add_course_type_and_category.sql"
    "create_courses_table.sql"
)

for migration in "${MIGRATIONS[@]}"; do
    FILE="$MIGRATIONS_DIR/$migration"
    if [ -f "$FILE" ]; then
        echo "  - $migration"
    fi
done

echo ""
echo -e "${YELLOW}To run a specific migration:${NC}"
echo "  ./run_migrations.sh $MIGRATIONS_DIR/add_course_type_and_category.sql"
echo ""
echo -e "${YELLOW}To run all migrations in order:${NC}"
for migration in "${MIGRATIONS[@]}"; do
    FILE="$MIGRATIONS_DIR/$migration"
    if [ -f "$FILE" ]; then
        echo "  mysql -u $DB_USER -p $DB_NAME < $FILE"
    fi
done
