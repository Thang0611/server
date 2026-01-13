#!/bin/bash

# Auto Fix Script - Tự động sửa các lỗi phát hiện từ test suite
# Based on: TEST_RESULTS_2026-01-13.md

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

log_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

log_error() {
    echo -e "${RED}✗ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

log_step() {
    echo -e "${MAGENTA}▶ $1${NC}"
}

echo "=========================================="
echo "🔧 AUTO FIX SCRIPT - ERROR CASES"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    log_warning "Not running as root. Some fixes might fail."
fi

# ==========================================
# FIX 1: Database Schema - Add Missing Columns
# ==========================================
echo ""
log_step "FIX 1: Adding missing database columns"
echo ""

log_info "Checking database connection..."

# Get DB credentials from .env
if [ -f "/root/server/.env" ]; then
    source /root/server/.env
    
    DB_HOST=${DB_HOST:-localhost}
    DB_USER=${DB_USER:-root}
    DB_PASS=${DB_PASSWORD:-}
    DB_NAME=${DB_NAME:-udemy_downloader}
    
    log_info "Database: $DB_NAME @ $DB_HOST"
    
    # Check if columns exist
    log_info "Checking for missing columns..."
    
    DRIVER_URL_EXISTS=$(mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -se "SHOW COLUMNS FROM download_tasks LIKE 'driver_url';" 2>/dev/null | wc -l)
    ERROR_MSG_EXISTS=$(mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -se "SHOW COLUMNS FROM download_tasks LIKE 'error_message';" 2>/dev/null | wc -l)
    
    if [ "$DRIVER_URL_EXISTS" -eq 0 ]; then
        log_warning "driver_url column is missing"
        log_info "Adding driver_url column..."
        
        mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "
            ALTER TABLE download_tasks 
            ADD COLUMN driver_url VARCHAR(500) NULL AFTER course_url;
        " 2>/dev/null && log_success "driver_url column added" || log_error "Failed to add driver_url column"
    else
        log_success "driver_url column already exists"
    fi
    
    if [ "$ERROR_MSG_EXISTS" -eq 0 ]; then
        log_warning "error_message column is missing"
        log_info "Adding error_message column..."
        
        mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "
            ALTER TABLE download_tasks 
            ADD COLUMN error_message TEXT NULL AFTER status;
        " 2>/dev/null && log_success "error_message column added" || log_error "Failed to add error_message column"
    else
        log_success "error_message column already exists"
    fi
    
else
    log_error ".env file not found, skipping database fixes"
fi

# ==========================================
# FIX 2: Create saved directory for sessions
# ==========================================
echo ""
log_step "FIX 2: Setting up session directory"
echo ""

SAVED_DIR="/root/server/udemy_dl/saved"
if [ ! -d "$SAVED_DIR" ]; then
    log_info "Creating saved/ directory..."
    mkdir -p "$SAVED_DIR"
    chmod 755 "$SAVED_DIR"
    log_success "saved/ directory created"
else
    log_success "saved/ directory already exists"
fi

# Check for session files
SESSION_COUNT=$(ls -1 "$SAVED_DIR" 2>/dev/null | wc -l)
if [ "$SESSION_COUNT" -eq 0 ]; then
    log_error "No session files found"
    log_warning "MANUAL ACTION REQUIRED:"
    echo ""
    echo "  1. Run the following command:"
    echo "     cd /root/server/udemy_dl"
    echo "     python3 main.py --login"
    echo ""
    echo "  2. Choose authentication method (browser recommended)"
    echo "  3. Login with Udemy account credentials"
    echo "  4. Session files will be saved to saved/ directory"
    echo ""
else
    log_success "Found $SESSION_COUNT session file(s)"
fi

# ==========================================
# FIX 3: Create .env if missing
# ==========================================
echo ""
log_step "FIX 3: Checking udemy_dl configuration"
echo ""

UDEMY_ENV="/root/server/udemy_dl/.env"
if [ ! -f "$UDEMY_ENV" ]; then
    log_info "Creating udemy_dl/.env file..."
    touch "$UDEMY_ENV"
    chmod 644 "$UDEMY_ENV"
    log_success ".env file created"
else
    if [ ! -s "$UDEMY_ENV" ]; then
        log_warning ".env file is empty"
        log_info "This might be OK if config is loaded from elsewhere"
    else
        log_success ".env file exists and has content"
    fi
fi

# ==========================================
# FIX 4: Clean up failed task directories
# ==========================================
echo ""
log_step "FIX 4: Checking failed task directories"
echo ""

STAGING_DIR="/root/server/udemy_dl/Staging_Download"
if [ -d "$STAGING_DIR" ]; then
    log_info "Checking for empty task directories..."
    
    EMPTY_COUNT=0
    for task_dir in "$STAGING_DIR"/Task_*; do
        if [ -d "$task_dir" ]; then
            FILE_COUNT=$(ls -1 "$task_dir" 2>/dev/null | wc -l)
            if [ "$FILE_COUNT" -eq 0 ]; then
                TASK_NAME=$(basename "$task_dir")
                log_warning "$TASK_NAME is empty (download failed)"
                EMPTY_COUNT=$((EMPTY_COUNT + 1))
            fi
        fi
    done
    
    if [ "$EMPTY_COUNT" -gt 0 ]; then
        log_info "Found $EMPTY_COUNT empty task directory(ies)"
        log_warning "These directories indicate failed downloads"
        log_info "They will be kept for debugging"
    else
        log_success "No empty task directories found"
    fi
else
    log_warning "Staging_Download directory not found"
fi

# ==========================================
# FIX 5: Check and restart PM2 workers if needed
# ==========================================
echo ""
log_step "FIX 5: Checking PM2 worker status"
echo ""

if command -v pm2 &> /dev/null; then
    log_info "Checking PM2 processes..."
    
    WORKER_COUNT=$(pm2 jlist 2>/dev/null | jq -r '.[] | select(.name=="worker") | .name' 2>/dev/null | wc -l)
    
    if [ "$WORKER_COUNT" -eq 0 ]; then
        log_warning "No PM2 workers found"
        log_info "Workers might be running under different process manager"
        log_info "Or need to be started with: pm2 start ecosystem.config.js"
    else
        log_success "Found $WORKER_COUNT worker process(es)"
        
        # Check if workers are online
        ONLINE_COUNT=$(pm2 jlist 2>/dev/null | jq -r '.[] | select(.name=="worker" and .pm2_env.status=="online") | .name' 2>/dev/null | wc -l)
        
        if [ "$ONLINE_COUNT" -eq "$WORKER_COUNT" ]; then
            log_success "All workers are online"
        else
            log_warning "Some workers are not online"
            log_info "You may need to restart: pm2 restart worker"
        fi
    fi
else
    log_warning "PM2 not found in PATH"
fi

# ==========================================
# FIX 6: Check Redis
# ==========================================
echo ""
log_step "FIX 6: Checking Redis connection"
echo ""

if command -v redis-cli &> /dev/null; then
    REDIS_PING=$(redis-cli ping 2>/dev/null || echo "FAILED")
    
    if [ "$REDIS_PING" == "PONG" ]; then
        log_success "Redis is online"
        
        QUEUE_LEN=$(redis-cli LLEN rq:queue:downloads 2>/dev/null || echo "0")
        log_info "Queue length: $QUEUE_LEN job(s)"
    else
        log_error "Redis is not responding"
        log_info "Try: sudo systemctl restart redis"
    fi
else
    log_warning "redis-cli not found in PATH"
fi

# ==========================================
# Summary
# ==========================================
echo ""
echo "=========================================="
echo "📊 FIX SUMMARY"
echo "=========================================="
echo ""

log_info "Automated fixes completed!"
echo ""
log_warning "MANUAL ACTIONS STILL REQUIRED:"
echo ""
echo "  1. 🔑 Login to Udemy account:"
echo "     cd /root/server/udemy_dl"
echo "     python3 main.py --login"
echo ""
echo "  2. 📚 Ensure account is enrolled in courses"
echo ""
echo "  3. 🧪 Run test again:"
echo "     node /root/server/scripts/test_error_cases.js"
echo ""
echo "  4. 🔄 Retry failed tasks:"
echo "     cd /root/server"
echo "     node scripts/retry_task.js 28"
echo ""

log_info "For detailed test results, check:"
echo "  - /root/server/TEST_RESULTS_2026-01-13.md"
echo "  - /root/server/LOG_ANALYSIS_2026-01-13.md"
echo ""

log_success "Auto-fix script completed!"
