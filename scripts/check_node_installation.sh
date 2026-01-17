#!/bin/bash

###############################################################################
# Script kiểm tra Node.js, npm, PM2 hiện tại
# Mục đích: Chuẩn bị migration sang System Node.js (không qua NVM)
###############################################################################

echo "=========================================="
echo "KIỂM TRA NODE.JS VÀ NPM HIỆN TẠI"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

###############################################################################
# 1. Kiểm tra Node.js
###############################################################################
echo -e "${BLUE}[1] Kiểm tra Node.js${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v node &> /dev/null; then
    NODE_PATH=$(which node)
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✅ Node.js found${NC}"
    echo "   Path: $NODE_PATH"
    echo "   Version: $NODE_VERSION"
    
    # Phân tích path
    if [[ "$NODE_PATH" == *".nvm"* ]]; then
        echo -e "${RED}⚠️  ĐANG DÙNG NVM!${NC}"
        echo "   → Cần chuyển sang System Node.js"
        USING_NVM=true
    elif [[ "$NODE_PATH" == "/usr/bin/node" ]] || [[ "$NODE_PATH" == "/usr/local/bin/node" ]]; then
        echo -e "${GREEN}✅ Đang dùng System Node.js (Tốt)${NC}"
        USING_NVM=false
    else
        echo -e "${YELLOW}⚠️  Node.js path không rõ ràng: $NODE_PATH${NC}"
        USING_NVM=false
    fi
else
    echo -e "${RED}❌ Node.js không tìm thấy${NC}"
    USING_NVM=false
fi

echo ""

###############################################################################
# 2. Kiểm tra npm
###############################################################################
echo -e "${BLUE}[2] Kiểm tra npm${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v npm &> /dev/null; then
    NPM_PATH=$(which npm)
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✅ npm found${NC}"
    echo "   Path: $NPM_PATH"
    echo "   Version: $NPM_VERSION"
    
    if [[ "$NPM_PATH" == *".nvm"* ]]; then
        echo -e "${RED}⚠️  npm đang dùng NVM${NC}"
    fi
else
    echo -e "${RED}❌ npm không tìm thấy${NC}"
fi

echo ""

###############################################################################
# 3. Kiểm tra PM2
###############################################################################
echo -e "${BLUE}[3] Kiểm tra PM2${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v pm2 &> /dev/null; then
    PM2_PATH=$(which pm2)
    PM2_VERSION=$(pm2 --version)
    echo -e "${GREEN}✅ PM2 found${NC}"
    echo "   Path: $PM2_PATH"
    echo "   Version: $PM2_VERSION"
    
    if [[ "$PM2_PATH" == *".nvm"* ]]; then
        echo -e "${RED}⚠️  PM2 đang dùng NVM${NC}"
        echo "   → Cần reinstall với System Node.js"
    fi
else
    echo -e "${RED}❌ PM2 không tìm thấy${NC}"
fi

echo ""

###############################################################################
# 4. Kiểm tra NVM
###############################################################################
echo -e "${BLUE}[4] Kiểm tra NVM${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "$HOME/.nvm/nvm.sh" ]; then
    echo -e "${YELLOW}⚠️  NVM được cài đặt tại: ~/.nvm/${NC}"
    echo "   File: $HOME/.nvm/nvm.sh"
    
    # Kiểm tra version NVM đang dùng
    if [ -n "$NVM_DIR" ]; then
        echo "   NVM_DIR: $NVM_DIR"
    fi
    
    # Kiểm tra node version trong NVM
    if [ -d "$HOME/.nvm/versions/node" ]; then
        echo "   Installed Node.js versions in NVM:"
        ls -1 "$HOME/.nvm/versions/node/" 2>/dev/null | while read ver; do
            echo "     - $ver"
        done
    fi
else
    echo -e "${GREEN}✅ NVM không được cài đặt${NC}"
fi

echo ""

###############################################################################
# 5. Kiểm tra System Node.js packages
###############################################################################
echo -e "${BLUE}[5] Kiểm tra System Node.js packages${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check dpkg
if command -v dpkg &> /dev/null; then
    NODEJS_PKG=$(dpkg -l | grep -i nodejs | head -5)
    if [ -n "$NODEJS_PKG" ]; then
        echo -e "${GREEN}✅ System Node.js packages:${NC}"
        echo "$NODEJS_PKG"
    else
        echo -e "${YELLOW}⚠️  Không có system nodejs package${NC}"
        echo "   → Cần cài đặt Node.js system-wide"
    fi
else
    echo -e "${YELLOW}⚠️  dpkg không có${NC}"
fi

echo ""

###############################################################################
# 6. Kiểm tra PM2 Startup Service
###############################################################################
echo -e "${BLUE}[6] Kiểm tra PM2 Startup Service${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

STARTUP_FILE="/etc/systemd/system/pm2-root.service"
if [ -f "$STARTUP_FILE" ]; then
    echo -e "${GREEN}✅ PM2 startup service found${NC}"
    echo "   File: $STARTUP_FILE"
    echo ""
    echo "   Content preview:"
    head -20 "$STARTUP_FILE" | sed 's/^/   /'
    echo ""
    
    # Kiểm tra có reference tới NVM không
    if grep -q "nvm" "$STARTUP_FILE"; then
        echo -e "${RED}⚠️  Startup script có reference tới NVM!${NC}"
        echo "   → Cần cập nhật sau khi chuyển sang System Node.js"
    else
        echo -e "${GREEN}✅ Startup script không có NVM${NC}"
    fi
    
    # Kiểm tra PATH
    if grep -q "PATH" "$STARTUP_FILE"; then
        echo "   PATH configuration:"
        grep "PATH" "$STARTUP_FILE" | sed 's/^/   /'
    fi
    
    # Kiểm tra service status
    if systemctl is-enabled pm2-root.service &> /dev/null; then
        echo -e "${GREEN}✅ Service is enabled${NC}"
    else
        echo -e "${YELLOW}⚠️  Service is NOT enabled${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  PM2 startup service không tồn tại${NC}"
    echo "   → Cần tạo sau khi cài System Node.js"
fi

echo ""

###############################################################################
# 7. Kiểm tra PATH
###############################################################################
echo -e "${BLUE}[7] Kiểm tra PATH environment${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Current PATH:"
echo "$PATH" | tr ':' '\n' | grep -E "(node|nvm|npm)" | while read path; do
    if [[ "$path" == *".nvm"* ]]; then
        echo -e "  ${RED}⚠️  $path (NVM)${NC}"
    else
        echo -e "  ${GREEN}✅ $path${NC}"
    fi
done

if ! echo "$PATH" | grep -q "nvm"; then
    echo -e "${GREEN}✅ PATH không có NVM${NC}"
fi

echo ""

###############################################################################
# 8. Tóm tắt và Khuyến nghị
###############################################################################
echo "=========================================="
echo "TÓM TẮT VÀ KHUYẾN NGHỊ"
echo "=========================================="
echo ""

if [ "$USING_NVM" = true ]; then
    echo -e "${RED}⚠️  ĐANG DÙNG NVM${NC}"
    echo ""
    echo "Các bước cần thực hiện:"
    echo ""
    echo "1. Cài đặt System Node.js:"
    echo "   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
    echo "   sudo apt-get install -y nodejs"
    echo ""
    echo "2. Reinstall PM2 với System Node.js:"
    echo "   sudo npm install -g pm2"
    echo ""
    echo "3. Cập nhật PM2 startup:"
    echo "   pm2 startup systemd -u root --hp /root"
    echo "   pm2 save"
    echo "   sudo systemctl enable pm2-root.service"
    echo ""
    echo "4. Kiểm tra lại:"
    echo "   which node  # Phải là /usr/bin/node"
    echo "   pm2 list"
    echo ""
    echo -e "${YELLOW}Xem chi tiết trong: docs/NVM_VS_SYSTEM_NODE.md${NC}"
else
    echo -e "${GREEN}✅ Đang dùng System Node.js hoặc chưa có Node.js${NC}"
    echo ""
    if ! command -v node &> /dev/null; then
        echo "Cần cài đặt Node.js:"
        echo "   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
        echo "   sudo apt-get install -y nodejs"
    else
        echo "Node.js đã được cài đặt đúng cách."
        echo "Chỉ cần đảm bảo PM2 startup được cấu hình đúng."
    fi
fi

echo ""

###############################################################################
# 9. Kiểm tra PM2 processes hiện tại
###############################################################################
echo -e "${BLUE}[8] Kiểm tra PM2 processes${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v pm2 &> /dev/null; then
    echo "PM2 list:"
    pm2 list 2>&1 | head -15 | sed 's/^/   /'
    echo ""
    
    if pm2 jlist &> /dev/null; then
        DUMP_FILE="$HOME/.pm2/dump.pm2"
        if [ -f "$DUMP_FILE" ]; then
            echo -e "${GREEN}✅ PM2 dump file exists: $DUMP_FILE${NC}"
        else
            echo -e "${YELLOW}⚠️  PM2 dump file không tồn tại${NC}"
            echo "   → Chạy 'pm2 save' sau khi start processes"
        fi
    fi
else
    echo -e "${YELLOW}⚠️  PM2 không có, bỏ qua${NC}"
fi

echo ""
echo "=========================================="
echo "KIỂM TRA HOÀN TẤT"
echo "=========================================="
