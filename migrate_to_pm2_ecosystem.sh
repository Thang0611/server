#!/bin/bash

###############################################################################
# PM2 Ecosystem Migration Script
# Purpose: Migrate from systemd + old PM2 processes to unified PM2 Ecosystem
# Author: AI Assistant
# Date: 2026-01-12
###############################################################################

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo ""
    echo "=========================================="
    echo "$1"
    echo "=========================================="
}

###############################################################################
# STEP 1: Pre-migration Checks
###############################################################################

print_header "STEP 1: Pre-Migration Checks"

# Check if running as root (needed for systemctl)
if [ "$EUID" -ne 0 ]; then 
    log_warning "Not running as root. Some operations may require sudo."
fi

# Check if ecosystem.config.js exists
if [ ! -f "ecosystem.config.js" ]; then
    log_error "ecosystem.config.js not found in current directory!"
    exit 1
fi
log_success "ecosystem.config.js found"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    log_error "PM2 is not installed. Install it with: npm install -g pm2"
    exit 1
fi
log_success "PM2 is installed"

# Check if Python3 is installed
if ! command -v python3 &> /dev/null; then
    log_error "Python3 is not installed"
    exit 1
fi
log_success "Python3 is installed"

# Check if worker_rq.py exists
if [ ! -f "udemy_dl/worker_rq.py" ]; then
    log_error "udemy_dl/worker_rq.py not found!"
    exit 1
fi
log_success "worker_rq.py found"

# Show current PM2 processes
log_info "Current PM2 processes:"
pm2 list

###############################################################################
# STEP 2: Stop and Disable Systemd Service
###############################################################################

print_header "STEP 2: Stop Systemd Service"

if systemctl is-active --quiet udemy-worker-rq.service; then
    log_info "Stopping udemy-worker-rq.service..."
    sudo systemctl stop udemy-worker-rq.service
    log_success "Service stopped"
else
    log_warning "Service udemy-worker-rq.service is not running"
fi

if systemctl is-enabled --quiet udemy-worker-rq.service; then
    log_info "Disabling udemy-worker-rq.service..."
    sudo systemctl disable udemy-worker-rq.service
    log_success "Service disabled"
else
    log_warning "Service udemy-worker-rq.service is not enabled"
fi

log_success "Systemd service cleaned up"

###############################################################################
# STEP 3: Kill Lingering Python Worker Processes
###############################################################################

print_header "STEP 3: Clean Up Zombie Python Processes"

log_info "Searching for Python worker processes..."

# Find and kill worker_rq.py processes
if pgrep -f "worker_rq.py" > /dev/null; then
    log_warning "Found running worker_rq.py processes. Killing them..."
    pkill -f "worker_rq.py" || true
    sleep 2
    
    # Force kill if still running
    if pgrep -f "worker_rq.py" > /dev/null; then
        log_warning "Some processes still running. Force killing..."
        pkill -9 -f "worker_rq.py" || true
    fi
    
    log_success "Python worker processes killed"
else
    log_info "No worker_rq.py processes found"
fi

# Also check for old worker.py processes
if pgrep -f "worker.py" > /dev/null; then
    log_warning "Found old worker.py processes. Killing them..."
    pkill -f "worker.py" || true
    pkill -9 -f "worker.py" || true
    log_success "Old worker.py processes killed"
fi

###############################################################################
# STEP 4: Clean Up Old PM2 Processes
###############################################################################

print_header "STEP 4: Clean Up Old PM2 Processes"

log_info "Deleting old PM2 processes..."

# Delete old udemy-worker (if exists)
if pm2 list | grep -q "udemy-worker"; then
    log_info "Deleting old 'udemy-worker' process..."
    pm2 delete udemy-worker || true
    log_success "Old udemy-worker deleted"
else
    log_info "No 'udemy-worker' process found"
fi

# Also clean up udemy-api and client-nextjs (will be recreated by ecosystem)
log_warning "The following processes will be recreated with ecosystem.config.js:"
log_warning "  - backend (replaces udemy-api)"
log_warning "  - client-nextjs (will be reconfigured)"
log_warning "  - udemy-dl-workers (new, 5 instances)"

echo ""
read -p "Do you want to delete existing 'udemy-api' and 'client-nextjs'? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    pm2 delete udemy-api || true
    pm2 delete client-nextjs || true
    log_success "Existing processes deleted"
else
    log_info "Keeping existing processes. They will be updated by ecosystem."
fi

###############################################################################
# STEP 5: Create Logs Directory
###############################################################################

print_header "STEP 5: Prepare Log Directory"

if [ ! -d "logs" ]; then
    log_info "Creating logs directory..."
    mkdir -p logs
    log_success "Logs directory created"
else
    log_info "Logs directory already exists"
fi

###############################################################################
# STEP 6: Start New PM2 Ecosystem
###############################################################################

print_header "STEP 6: Start PM2 Ecosystem"

log_info "Starting ecosystem.config.js..."
pm2 start ecosystem.config.js

log_success "Ecosystem started successfully!"

# Wait a moment for processes to initialize
sleep 3

# Show status
log_info "Current PM2 status:"
pm2 list

###############################################################################
# STEP 7: Save PM2 Configuration
###############################################################################

print_header "STEP 7: Save PM2 Configuration"

log_info "Saving PM2 process list for auto-restart on reboot..."
pm2 save

# Setup PM2 startup script
log_info "Setting up PM2 startup script..."
pm2 startup | grep -E "^sudo" | bash || true

log_success "PM2 configuration saved!"

###############################################################################
# STEP 8: Post-Migration Verification
###############################################################################

print_header "STEP 8: Post-Migration Verification"

log_info "Running health checks..."

# Check if all processes are online
sleep 5  # Wait for processes to fully start

echo ""
log_info "Final PM2 Status:"
pm2 list

# Count online processes
ONLINE_COUNT=$(pm2 jlist | jq '[.[] | select(.pm2_env.status == "online")] | length')
TOTAL_COUNT=$(pm2 jlist | jq 'length')

echo ""
if [ "$ONLINE_COUNT" -eq "$TOTAL_COUNT" ]; then
    log_success "All processes are online! ($ONLINE_COUNT/$TOTAL_COUNT)"
else
    log_warning "Some processes are not online: $ONLINE_COUNT/$TOTAL_COUNT"
    log_info "Check logs with: pm2 logs"
fi

###############################################################################
# STEP 9: Final Instructions
###############################################################################

print_header "Migration Complete!"

echo ""
echo -e "${GREEN}✅ Migration to PM2 Ecosystem completed successfully!${NC}"
echo ""
echo "📋 Quick Reference Commands:"
echo "  • View all processes:       pm2 list"
echo "  • View logs (all):          pm2 logs"
echo "  • View logs (specific):     pm2 logs backend"
echo "  • Restart all:              pm2 restart ecosystem.config.js"
echo "  • Restart one:              pm2 restart backend"
echo "  • Stop all:                 pm2 stop ecosystem.config.js"
echo "  • Monitor:                  pm2 monit"
echo "  • Check Redis queue:        redis-cli LLEN rq:queue:downloads"
echo ""
echo "📁 Log files location:"
echo "  • Backend:  ./logs/backend-out.log"
echo "  • Workers:  ./logs/worker-out.log"
echo "  • Next.js:  ./logs/nextjs-out.log"
echo ""
echo "🔍 To verify workers are listening to Redis:"
echo "  pm2 logs udemy-dl-workers --lines 50 | grep 'REDIS WORKER'"
echo ""
echo "🚀 Your production environment is now running with:"
echo "  • 2x Node.js Backend (cluster mode)"
echo "  • 1x Next.js Frontend"
echo "  • 5x Python Redis Workers (parallel downloads)"
echo ""

log_success "All done! Your system is now running in PM2 Ecosystem mode."
