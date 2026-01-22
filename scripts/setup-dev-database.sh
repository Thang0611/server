#!/bin/bash

###############################################################################
# Setup Development Database
# 
# Tạo database mới riêng cho development để không ảnh hưởng production
#
# Usage: ./scripts/setup-dev-database.sh
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[⚠]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$SERVER_DIR"

echo "=========================================="
echo "  Development Database Setup"
echo "=========================================="
echo ""

# Check if .env.development exists
ENV_FILE="$SERVER_DIR/.env.development"
if [ ! -f "$ENV_FILE" ]; then
    print_error ".env.development not found!"
    print_status "Creating from example..."
    
    if [ -f "$SERVER_DIR/.env.development.example" ]; then
        cp "$SERVER_DIR/.env.development.example" "$ENV_FILE"
        print_success "Created .env.development from example"
        print_warning "Please edit .env.development and set your database credentials"
        print_status "Then run this script again"
        exit 1
    else
        print_error ".env.development.example not found!"
        exit 1
    fi
fi

# Load environment variables from .env.development
print_status "Loading environment variables from .env.development..."
export $(cat "$ENV_FILE" | grep -v '^#' | grep -v '^$' | xargs)

# Check required variables
if [ -z "$DB_NAME" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DB_HOST" ]; then
    print_error "Missing required database environment variables"
    echo "Required: DB_NAME, DB_USER, DB_PASSWORD, DB_HOST"
    echo ""
    print_status "Please check .env.development file"
    exit 1
fi

# Display configuration
echo ""
print_status "Database Configuration:"
echo "   Host: $DB_HOST"
echo "   Database: $DB_NAME"
echo "   User: $DB_USER"
echo ""

# Check if database already exists
print_status "Checking if database exists..."
DB_EXISTS=$(mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" -e "SHOW DATABASES LIKE '$DB_NAME';" 2>/dev/null | grep -c "$DB_NAME" || echo "0")

if [ "$DB_EXISTS" -gt 0 ]; then
    print_warning "Database '$DB_NAME' already exists!"
    read -p "Do you want to DROP and recreate it? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Dropping existing database..."
        mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" -e "DROP DATABASE IF EXISTS \`$DB_NAME\`;" 2>/dev/null
        print_success "Database dropped"
    else
        print_status "Keeping existing database"
        RECREATE=false
    fi
else
    RECREATE=true
fi

# Create database if needed
if [ "$RECREATE" = true ]; then
    print_status "Creating database '$DB_NAME'..."
    mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null
    print_success "Database created"
fi

# Run migration script
MIGRATION_FILE="$SERVER_DIR/scripts/migrations/create_all_tables.sql"
if [ ! -f "$MIGRATION_FILE" ]; then
    print_error "Migration file not found: $MIGRATION_FILE"
    exit 1
fi

print_status "Running database migrations..."
mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$MIGRATION_FILE"

if [ $? -eq 0 ]; then
    print_success "Database schema created successfully!"
    echo ""
    print_status "Tables created:"
    echo "   - orders"
    echo "   - download_tasks"
    echo "   - order_audit_logs"
    echo ""
    print_status "Views created:"
    echo "   - v_order_latest_events"
    echo "   - v_order_errors"
    echo ""
    print_status "Stored procedures created:"
    echo "   - sp_log_audit_event"
    echo ""
    print_success "Development database setup completed!"
    echo ""
    print_status "You can now start development server with:"
    echo "   cd /root/project/server"
    echo "   PORT=3001 NODE_ENV=development npm run dev"
else
    print_error "Database setup failed"
    exit 1
fi
