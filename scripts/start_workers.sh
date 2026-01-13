#!/bin/bash

###############################################################################
# RQ Workers Startup Script
# Starts multiple Python RQ workers to process download tasks from Redis queue
###############################################################################

set -e  # Exit on error

# Configuration
WORKER_COUNT=5
QUEUE_NAME="downloads"
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
WORKER_DIR="/root/server/udemy_dl"
LOG_DIR="/root/server/logs"
PID_FILE="/root/server/rq_workers.pid"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Function to log messages
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARN:${NC} $1"
}

# Check if workers are already running
if [ -f "$PID_FILE" ]; then
    warn "PID file exists. Checking if workers are running..."
    
    # Read PIDs and check if processes are still running
    running=false
    while IFS= read -r pid; do
        if kill -0 "$pid" 2>/dev/null; then
            running=true
            break
        fi
    done < "$PID_FILE"
    
    if [ "$running" = true ]; then
        error "Workers are already running. Stop them first with: ./stop_workers.sh"
        exit 1
    else
        warn "Stale PID file found. Removing..."
        rm "$PID_FILE"
    fi
fi

# Change to worker directory
cd "$WORKER_DIR" || {
    error "Failed to change to worker directory: $WORKER_DIR"
    exit 1
}

log "Starting $WORKER_COUNT RQ workers..."
log "Queue: $QUEUE_NAME"
log "Redis URL: $REDIS_URL"
log "Worker Directory: $WORKER_DIR"
log "Log Directory: $LOG_DIR"

# Clear old PID file if exists
> "$PID_FILE"

# Start workers
for i in $(seq 1 $WORKER_COUNT); do
    log_file="$LOG_DIR/rq_worker_$i.log"
    
    # Start Python Redis worker in background
    # Pass worker ID as argument
    # -u flag: unbuffered output for immediate logging
    nohup python3 -u "$WORKER_DIR/worker_rq.py" "$i" \
        > "$log_file" 2>&1 &
    
    worker_pid=$!
    echo "$worker_pid" >> "$PID_FILE"
    
    log "Worker $i started (PID: $worker_pid, Log: $log_file)"
    
    # Small delay to prevent race conditions
    sleep 0.5
done

log "${GREEN}All $WORKER_COUNT workers started successfully!${NC}"
log ""
log "Monitor workers with:"
log "  tail -f $LOG_DIR/rq_worker_*.log"
log ""
log "Check worker status with:"
log "  rq info --url $REDIS_URL"
log ""
log "Stop workers with:"
log "  ./stop_workers.sh"

exit 0
