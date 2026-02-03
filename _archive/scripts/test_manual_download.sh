#!/bin/bash

# Manual Download Test Script
# Test các trường hợp download với different scenarios

set -e

UDEMY_DIR="/root/server/udemy_dl"
TEST_OUTPUT_DIR="$UDEMY_DIR/Test_Manual"

echo "=========================================="
echo "🧪 MANUAL DOWNLOAD TEST SUITE"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Test 1: Check if main.py exists
echo "TEST 1: Checking Udemy Downloader Setup"
echo "----------------------------------------"
cd "$UDEMY_DIR"

if [ -f "main.py" ]; then
    log_success "main.py found"
else
    log_error "main.py not found!"
    exit 1
fi

# Test 2: Check Python version
log_info "Checking Python version..."
PYTHON_VERSION=$(python3 --version)
log_info "Python: $PYTHON_VERSION"

# Test 3: Check for session files
echo ""
echo "TEST 2: Checking Session Files"
echo "----------------------------------------"
if [ -d "saved" ]; then
    SESSION_COUNT=$(ls -1 saved/ 2>/dev/null | wc -l)
    if [ "$SESSION_COUNT" -gt 0 ]; then
        log_success "Found $SESSION_COUNT session file(s)"
        ls -lh saved/
    else
        log_warning "No session files found"
        log_warning "You need to run: python3 main.py --login"
    fi
else
    log_error "saved/ directory not found"
fi

# Test 4: Try to list courses (enrollment check)
echo ""
echo "TEST 3: Testing Course Enrollment (Task 28 URL)"
echo "----------------------------------------"
TASK_28_URL="https://samsungu.udemy.com/course/tu-ong-hoa-cong-viec-bang-ai-agent-va-n8n/"

log_info "Testing URL: $TASK_28_URL"
log_info "Running: python3 main.py -c URL --list-lectures"

# Run with timeout
timeout 15 python3 main.py -c "$TASK_28_URL" --list-lectures 2>&1 | head -30 > /tmp/test_enrollment.log

if grep -q "Failed to find the course" /tmp/test_enrollment.log; then
    log_error "NOT ENROLLED in course!"
    log_error "Account needs to be enrolled first"
    echo ""
    log_info "Error details:"
    grep -A 2 "Failed to find the course" /tmp/test_enrollment.log
elif grep -q "Chapter" /tmp/test_enrollment.log; then
    log_success "Course is accessible (enrolled)"
    log_info "Found chapters:"
    grep "Chapter" /tmp/test_enrollment.log | head -5
else
    log_warning "Enrollment status unclear"
    log_info "Output:"
    cat /tmp/test_enrollment.log
fi

# Test 5: Try invalid URL
echo ""
echo "TEST 4: Testing Invalid Course URL"
echo "----------------------------------------"
INVALID_URL="https://samsungu.udemy.com/course/invalid-course-12345/"

log_info "Testing with invalid URL..."
timeout 10 python3 main.py -c "$INVALID_URL" --list-lectures 2>&1 | head -20 > /tmp/test_invalid.log || true

if grep -q "Failed to find the course" /tmp/test_invalid.log; then
    log_success "Correctly detected invalid course"
elif grep -q "404" /tmp/test_invalid.log; then
    log_success "Got 404 for invalid course"
else
    log_info "Response unclear"
fi

# Test 6: Check keyfile
echo ""
echo "TEST 5: Checking DRM Keyfile"
echo "----------------------------------------"
if [ -f "keyfile.json" ]; then
    log_success "keyfile.json exists (can decrypt DRM videos)"
else
    log_warning "keyfile.json NOT found"
    log_warning "Cannot decrypt encrypted videos"
    log_info "This is OK if courses don't have DRM"
fi

# Test 7: Check disk space
echo ""
echo "TEST 6: Checking Disk Space"
echo "----------------------------------------"
log_info "Disk usage for udemy_dl:"
du -sh "$UDEMY_DIR" 2>/dev/null || log_warning "Cannot check disk usage"

log_info "Staging_Download usage:"
if [ -d "Staging_Download" ]; then
    du -sh Staging_Download/ 2>/dev/null
    log_info "Task directories:"
    ls -lh Staging_Download/ | grep Task_
else
    log_warning "Staging_Download directory not found"
fi

# Test 8: Check failed tasks
echo ""
echo "TEST 7: Checking Failed Task Directories"
echo "----------------------------------------"
if [ -d "Staging_Download" ]; then
    cd Staging_Download
    for task_dir in Task_*; do
        if [ -d "$task_dir" ]; then
            FILE_COUNT=$(ls -1 "$task_dir" 2>/dev/null | wc -l)
            if [ "$FILE_COUNT" -eq 0 ]; then
                log_error "$task_dir is EMPTY (download failed)"
            else
                log_info "$task_dir: $FILE_COUNT file(s)"
            fi
        fi
    done
    cd ..
else
    log_warning "No Staging_Download directory"
fi

# Test 9: Simulate a quick download test (if enrolled)
echo ""
echo "TEST 8: Download Test (Optional)"
echo "----------------------------------------"
log_warning "Skipping actual download test to save time"
log_info "To run manual download test:"
echo "  cd $UDEMY_DIR"
echo "  python3 main.py -c 'YOUR_COURSE_URL' -o Test_Manual -q 360"

# Summary
echo ""
echo "=========================================="
echo "📊 TEST SUMMARY"
echo "=========================================="
echo ""

# Check if Task 28 failed
if [ -d "Staging_Download/Task_28" ]; then
    TASK_28_COUNT=$(ls -1 Staging_Download/Task_28 2>/dev/null | wc -l)
    if [ "$TASK_28_COUNT" -eq 0 ]; then
        log_error "Task 28 directory is EMPTY - Download FAILED"
        log_info "Reason: Account not enrolled in course"
    fi
fi

# Recommendations
echo ""
log_info "RECOMMENDATIONS:"
echo "  1. Check if account is enrolled in course"
echo "  2. Run: python3 main.py --login (if session expired)"
echo "  3. Check database for Task 28 error details"
echo "  4. Review: /root/server/LOG_ANALYSIS_2026-01-13.md"

echo ""
log_success "Test suite completed!"
