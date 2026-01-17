#!/bin/bash

###############################################################################
# Script Migration từ NVM sang System Node.js
# Mục đích: Chuyển hoàn toàn sang production Node.js (không qua NVM) cho PM2
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=========================================="
echo "MIGRATION: NVM → SYSTEM NODE.JS"
echo "=========================================="
echo ""

###############################################################################
# STEP 1: Kiểm tra hiện trạng
###############################################################################

print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

log_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header "STEP 1: Kiểm tra hiện trạng"

# Check Node.js
if command -v node &> /dev/null; then
    NODE_PATH=$(which node)
    NODE_VERSION=$(node --version)
    log_success "Node.js: $NODE_PATH ($NODE_VERSION)"
    
    if [[ "$NODE_PATH" == *".nvm"* ]]; then
        USING_NVM=true
        log_error "Đang dùng NVM - cần migration"
    else
        USING_NVM=false
        log_success "Đang dùng System Node.js - không cần migration"
    fi
else
    USING_NVM=false
    log_error "Node.js không tìm thấy"
fi

# Check PM2
if command -v pm2 &> /dev/null; then
    PM2_PATH=$(which pm2)
    PM2_VERSION=$(pm2 --version)
    log_success "PM2: $PM2_PATH ($PM2_VERSION)"
else
    log_error "PM2 không tìm thấy"
fi

# Check NVM
if [ -f "$HOME/.nvm/nvm.sh" ]; then
    log_info "NVM được cài đặt tại ~/.nvm/"
    HAS_NVM=true
else
    log_info "NVM không được cài đặt"
    HAS_NVM=false
fi

###############################################################################
# STEP 2: Backup PM2 processes
###############################################################################

print_header "STEP 2: Backup PM2 processes"

if command -v pm2 &> /dev/null; then
    log_info "Đang backup PM2 process list..."
    pm2 save || log_error "Không thể save PM2 processes"
    
    # Backup dump file
    if [ -f "$HOME/.pm2/dump.pm2" ]; then
        cp "$HOME/.pm2/dump.pm2" "$HOME/.pm2/dump.pm2.backup.$(date +%Y%m%d_%H%M%S)"
        log_success "Backup PM2 dump file"
    fi
else
    log_info "PM2 không có, bỏ qua backup"
fi

###############################################################################
# STEP 3: Cài đặt System Node.js
###############################################################################

print_header "STEP 3: Cài đặt System Node.js"

if [ "$USING_NVM" = true ] || ! command -v node &> /dev/null; then
    log_info "Đang cài đặt Node.js từ NodeSource..."
    
    # Detect Node.js version hiện tại (nếu có)
    if [ "$USING_NVM" = true ]; then
        CURRENT_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
        log_info "Node.js version hiện tại: v$CURRENT_VERSION"
        VERSION_TO_INSTALL=${CURRENT_VERSION:-18}
    else
        VERSION_TO_INSTALL=18
    fi
    
    echo ""
    log_info "Sẽ cài đặt Node.js v$VERSION_TO_INSTALL.x"
    read -p "Tiếp tục? (y/N): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Add NodeSource repository
        curl -fsSL "https://deb.nodesource.com/setup_${VERSION_TO_INSTALL}.x" | sudo -E bash -
        
        # Install Node.js
        sudo apt-get install -y nodejs
        
        log_success "Node.js đã được cài đặt"
        
        # Verify
        if command -v node &> /dev/null; then
            NEW_NODE_PATH=$(which node)
            NEW_NODE_VERSION=$(node --version)
            log_success "Node.js mới: $NEW_NODE_PATH ($NEW_NODE_VERSION)"
            
            if [[ "$NEW_NODE_PATH" == *".nvm"* ]]; then
                log_error "Vẫn đang dùng NVM - kiểm tra lại PATH"
                exit 1
            fi
        fi
    else
        log_info "Bỏ qua cài đặt Node.js"
    fi
else
    log_success "System Node.js đã có sẵn"
fi

###############################################################################
# STEP 4: Reinstall PM2 với System Node.js
###############################################################################

print_header "STEP 4: Reinstall PM2 với System Node.js"

log_info "Đang reinstall PM2 với System Node.js..."

# Uninstall PM2 cũ (nếu cài qua NVM)
if [ "$USING_NVM" = true ]; then
    log_info "Gỡ PM2 cũ (có thể từ NVM)..."
    npm uninstall -g pm2 2>/dev/null || true
fi

# Install PM2 với system Node.js
sudo npm install -g pm2

# Verify PM2
if command -v pm2 &> /dev/null; then
    NEW_PM2_PATH=$(which pm2)
    NEW_PM2_VERSION=$(pm2 --version)
    log_success "PM2 mới: $NEW_PM2_PATH ($NEW_PM2_VERSION)"
    
    if [[ "$NEW_PM2_PATH" == *".nvm"* ]]; then
        log_error "PM2 vẫn dùng NVM - kiểm tra lại"
        exit 1
    fi
else
    log_error "PM2 không được cài đặt"
    exit 1
fi

###############################################################################
# STEP 5: Cập nhật PM2 Startup
###############################################################################

print_header "STEP 5: Cập nhật PM2 Startup"

log_info "Đang tạo PM2 startup script..."

# Remove old startup service
if [ -f "/etc/systemd/system/pm2-root.service" ]; then
    log_info "Tắt service cũ..."
    sudo systemctl disable pm2-root.service 2>/dev/null || true
    sudo systemctl stop pm2-root.service 2>/dev/null || true
fi

# Generate new startup script
STARTUP_OUTPUT=$(pm2 startup systemd -u root --hp /root 2>&1)

# Extract sudo command
STARTUP_CMD=$(echo "$STARTUP_OUTPUT" | grep -E "^sudo" | head -1)

if [ -z "$STARTUP_CMD" ]; then
    # Try alternative format
    STARTUP_CMD=$(echo "$STARTUP_OUTPUT" | tail -1 | grep "sudo")
fi

if [ -n "$STARTUP_CMD" ]; then
    log_info "Chạy startup command..."
    echo "$STARTUP_CMD"
    eval "$STARTUP_CMD" || {
        log_error "Không thể tạo startup script"
        log_info "Vui lòng chạy thủ công:"
        echo "  $STARTUP_CMD"
    }
else
    log_error "Không tìm thấy startup command"
    log_info "Vui lòng chạy thủ công:"
    echo "  pm2 startup systemd -u root --hp /root"
fi

###############################################################################
# STEP 6: Verify và cập nhật Startup Script
###############################################################################

print_header "STEP 6: Verify Startup Script"

STARTUP_FILE="/etc/systemd/system/pm2-root.service"
if [ -f "$STARTUP_FILE" ]; then
    log_success "Startup script đã được tạo: $STARTUP_FILE"
    
    # Check for NVM references
    if grep -q "nvm" "$STARTUP_FILE"; then
        log_error "Startup script vẫn có NVM reference!"
        log_info "Đang loại bỏ NVM references..."
        
        # Backup
        sudo cp "$STARTUP_FILE" "$STARTUP_FILE.backup"
        
        # Remove nvm from PATH if exists
        sudo sed -i '/nvm/d' "$STARTUP_FILE"
        
        # Reload systemd
        sudo systemctl daemon-reload
        
        log_success "Đã loại bỏ NVM references"
    else
        log_success "Startup script không có NVM (OK)"
    fi
    
    # Show PATH configuration
    echo ""
    log_info "PATH configuration trong startup script:"
    grep -i "PATH\|Environment" "$STARTUP_FILE" | sed 's/^/   /' || echo "   (không có PATH config)"
else
    log_error "Startup script không tồn tại"
fi

###############################################################################
# STEP 7: Start PM2 processes
###############################################################################

print_header "STEP 7: Start PM2 processes"

ECOSYSTEM_FILE="/root/project/server/ecosystem.config.js"
if [ -f "$ECOSYSTEM_FILE" ]; then
    log_info "Đang start PM2 ecosystem..."
    
    cd /root/project/server
    
    # Stop old processes if any
    pm2 delete all 2>/dev/null || true
    
    # Start ecosystem
    pm2 start ecosystem.config.js || {
        log_error "Không thể start ecosystem"
        log_info "Kiểm tra lỗi và thử lại thủ công"
    }
    
    sleep 2
    
    # Show status
    pm2 list
    
    # Save processes
    log_info "Đang save PM2 processes..."
    pm2 save || log_error "Không thể save processes"
    
    log_success "PM2 processes đã được start và save"
else
    log_error "Không tìm thấy ecosystem.config.js"
    log_info "Start PM2 processes thủ công và chạy 'pm2 save'"
fi

###############################################################################
# STEP 8: Enable PM2 Service
###############################################################################

print_header "STEP 8: Enable PM2 Service"

sudo systemctl enable pm2-root.service || {
    log_error "Không thể enable service"
}

log_info "Kiểm tra service status..."
systemctl is-enabled pm2-root.service && log_success "Service is enabled" || log_error "Service is NOT enabled"

###############################################################################
# STEP 9: Final Verification
###############################################################################

print_header "STEP 9: Final Verification"

echo ""
log_info "Kiểm tra Node.js:"
which node
node --version

echo ""
log_info "Kiểm tra PM2:"
which pm2
pm2 --version

echo ""
log_info "Kiểm tra PM2 processes:"
pm2 list

echo ""
log_info "Kiểm tra startup service:"
systemctl status pm2-root.service --no-pager -l | head -15 || true

###############################################################################
# SUMMARY
###############################################################################

print_header "MIGRATION HOÀN TẤT"

echo ""
log_success "Migration từ NVM sang System Node.js đã hoàn tất!"
echo ""
echo "Kiểm tra quan trọng:"
echo ""
echo "1. Node.js path:"
echo "   which node"
echo "   → Phải là /usr/bin/node (KHÔNG phải ~/.nvm/)"
echo ""
echo "2. PM2 path:"
echo "   which pm2"
echo "   → Phải là /usr/local/bin/pm2 hoặc /usr/bin/pm2"
echo ""
echo "3. Startup script:"
echo "   sudo cat /etc/systemd/system/pm2-root.service | grep -i nvm"
echo "   → Không nên có 'nvm'"
echo ""
echo "4. Test reboot (CẨN THẬN!):"
echo "   sudo reboot"
echo "   # Sau reboot, kiểm tra:"
echo "   pm2 list"
echo ""
echo -e "${YELLOW}⚠️  Nếu có vấn đề, restore từ backup:${NC}"
echo "   cp ~/.pm2/dump.pm2.backup.* ~/.pm2/dump.pm2"
echo "   pm2 resurrect"
echo ""
