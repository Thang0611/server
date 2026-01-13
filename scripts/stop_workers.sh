#!/bin/bash

###############################################################################
# RQ Workers Stop Script
# Gracefully stops all running RQ workers
###############################################################################

set -e  # Exit on error

# Configuration
PID_FILE="/root/server/rq_workers.pid"
FORCE_KILL_TIMEOUT=30  # Seconds to wait before force kill

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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

# Check if PID file exists
if [ ! -f "$PID_FILE" ]; then
    warn "No PID file found. Workers may not be running."
    exit 0
fi

log "Stopping RQ workers..."

# Read PIDs and send SIGTERM (graceful shutdown)
stopped=0
failed=0

while IFS= read -r pid; do
    if kill -0 "$pid" 2>/dev/null; then
        log "Sending SIGTERM to worker (PID: $pid)..."
        if kill -TERM "$pid" 2>/dev/null; then
            stopped=$((stopped + 1))
        else
            error "Failed to send SIGTERM to PID: $pid"
            failed=$((failed + 1))
        fi
    else
        warn "Worker (PID: $pid) is not running"
    fi
done < "$PID_FILE"

# Wait for graceful shutdown
if [ $stopped -gt 0 ]; then
    log "Waiting for workers to finish current jobs (max ${FORCE_KILL_TIMEOUT}s)..."
    
    timeout=$FORCE_KILL_TIMEOUT
    while [ $timeout -gt 0 ]; do
        # Check if any workers are still running
        still_running=false
        while IFS= read -r pid; do
            if kill -0 "$pid" 2>/dev/null; then
                still_running=true
                break
            fi
        done < "$PID_FILE"
        
        if [ "$still_running" = false ]; then
            break
        fi
        
        sleep 1
        timeout=$((timeout - 1))
    done
    
    # Force kill if still running
    if [ "$still_running" = true ]; then
        warn "Some workers did not stop gracefully. Force killing..."
        
        while IFS= read -r pid; do
            if kill -0 "$pid" 2>/dev/null; then
                log "Force killing worker (PID: $pid)..."
                kill -KILL "$pid" 2>/dev/null || true
            fi
        done < "$PID_FILE"
    fi
fi

# Remove PID file
rm "$PID_FILE"

log "${GREEN}All workers stopped successfully!${NC}"
log "Stopped: $stopped, Failed: $failed"

exit 0
