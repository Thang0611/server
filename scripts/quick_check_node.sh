#!/bin/bash
# Script kiểm tra nhanh Node.js/NPM installation type

echo "=========================================="
echo "KIỂM TRA NHANH NODE.JS/NPM"
echo "=========================================="
echo ""

# Check node
echo "1. Node.js:"
if command -v node &> /dev/null; then
    NODE_PATH=$(which node)
    NODE_VERSION=$(node --version)
    echo "   Path: $NODE_PATH"
    echo "   Version: $NODE_VERSION"
    
    if [[ "$NODE_PATH" == *"/.nvm/"* ]]; then
        echo "   ❌ ĐANG DÙNG NVM!"
    elif [[ "$NODE_PATH" == "/usr/bin/node" ]] || [[ "$NODE_PATH" == "/usr/local/bin/node" ]] || [[ "$NODE_PATH" == "/snap/bin/node" ]]; then
        echo "   ✅ System Node.js (Tốt)"
    else
        echo "   ⚠️  Path không rõ: $NODE_PATH"
    fi
else
    echo "   ❌ Node.js không tìm thấy"
fi

echo ""

# Check npm
echo "2. npm:"
if command -v npm &> /dev/null; then
    NPM_PATH=$(which npm)
    NPM_VERSION=$(npm --version)
    echo "   Path: $NPM_PATH"
    echo "   Version: $NPM_VERSION"
    
    if [[ "$NPM_PATH" == *"/.nvm/"* ]]; then
        echo "   ❌ ĐANG DÙNG NVM!"
    elif [[ "$NPM_PATH" == "/usr/bin/npm" ]] || [[ "$NPM_PATH" == "/usr/local/bin/npm" ]] || [[ "$NPM_PATH" == "/snap/bin/npm" ]]; then
        echo "   ✅ System npm (Tốt)"
    else
        echo "   ⚠️  Path không rõ: $NPM_PATH"
    fi
else
    echo "   ❌ npm không tìm thấy"
fi

echo ""

# Check pm2
echo "3. PM2:"
if command -v pm2 &> /dev/null; then
    PM2_PATH=$(which pm2)
    PM2_VERSION=$(pm2 --version)
    echo "   Path: $PM2_PATH"
    echo "   Version: $PM2_VERSION"
    
    if [[ "$PM2_PATH" == *"/.nvm/"* ]]; then
        echo "   ❌ PM2 đang dùng NVM!"
    else
        echo "   ✅ PM2 OK"
    fi
else
    echo "   ❌ PM2 không tìm thấy"
fi

echo ""

# Check NVM
echo "4. NVM:"
if [ -f "$HOME/.nvm/nvm.sh" ]; then
    echo "   ⚠️  NVM được cài đặt tại: ~/.nvm/"
    if [[ "$NODE_PATH" != *"/.nvm/"* ]]; then
        echo "   ℹ️  Nhưng Node.js hiện tại KHÔNG dùng NVM (Tốt)"
    else
        echo "   ❌ Và Node.js đang dùng NVM (Cần chuyển)"
    fi
else
    echo "   ✅ NVM không được cài đặt"
fi

echo ""

# Check system packages
echo "5. System Node.js packages:"
if command -v dpkg &> /dev/null; then
    NODEJS_PKG=$(dpkg -l | grep -i "^ii.*nodejs" | head -3)
    if [ -n "$NODEJS_PKG" ]; then
        echo "   ✅ Có system nodejs package:"
        echo "$NODEJS_PKG" | sed 's/^/      /'
    else
        echo "   ❌ Không có system nodejs package"
    fi
fi

echo ""
echo "=========================================="
echo "KẾT LUẬN:"
echo "=========================================="

if [[ "$NODE_PATH" == *"/.nvm/"* ]] || [[ "$NPM_PATH" == *"/.nvm/"* ]]; then
    echo "❌ ĐANG DÙNG NVM - Cần migration sang System Node.js"
    echo ""
    echo "Chạy migration script:"
    echo "  bash /root/project/server/scripts/migrate_to_system_nodejs.sh"
else
    echo "✅ Đang dùng System Node.js - OK cho production!"
fi

echo ""
