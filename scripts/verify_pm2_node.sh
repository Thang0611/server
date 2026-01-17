#!/bin/bash

echo "=========================================="
echo "  PM2 Node.js Verification Script"
echo "=========================================="
echo ""

echo "1. System Node.js:"
echo "   Path: /usr/bin/node"
echo "   Version: $(/usr/bin/node --version)"
echo ""

echo "2. PM2 Processes đang dùng node nào:"
for pid in $(pgrep -f "node /root/project/server/server.js" 2>/dev/null | head -2); do
    node_path=$(readlink -f /proc/$pid/exe 2>/dev/null)
    echo "   PID $pid: $node_path"
done
echo ""

echo "3. PM2 Service Configuration:"
echo "   PATH trong service file:"
sudo grep "Environment=PATH" /etc/systemd/system/pm2-root.service | sed 's/^/   /'
echo ""
echo "   ExecStart:"
sudo grep "ExecStart" /etc/systemd/system/pm2-root.service | sed 's/^/   /'
echo ""

echo "4. NVM trong service file:"
if sudo grep -i nvm /etc/systemd/system/pm2-root.service > /dev/null 2>&1; then
    echo "   ❌ FAIL: Vẫn có NVM trong service file"
else
    echo "   ✅ PASS: Không có NVM trong service file"
fi
echo ""

echo "5. PM2 Processes Status:"
pm2 list --no-color | grep -E "online" | wc -l | xargs echo "   Processes online:"
echo ""

echo "6. Service Status:"
systemctl is-enabled pm2-root.service > /dev/null 2>&1 && echo "   ✅ Service is ENABLED" || echo "   ❌ Service is NOT enabled"
systemctl is-active pm2-root.service > /dev/null 2>&1 && echo "   ✅ Service is ACTIVE" || echo "   ❌ Service is NOT active"
echo ""

echo "7. Shell Environment (for reference only):"
echo "   which node: $(which node)"
echo "   node --version: $(node --version)"
echo "   ⚠️  Lưu ý: Shell session có thể load NVM từ .bashrc/.profile"
echo "   Nhưng PM2 service KHÔNG bị ảnh hưởng vì systemd không load shell init scripts"
echo ""

echo "=========================================="
echo "  Kết luận:"
echo "=========================================="
if readlink -f /proc/$(pgrep -f "node /root/project/server/server.js" | head -1)/exe 2>/dev/null | grep -q "/usr/bin/node"; then
    echo "✅ PM2 processes đang dùng SYSTEM Node.js (/usr/bin/node)"
    echo "✅ PM2 sẽ tự động start sau reboot KHÔNG cần NVM"
else
    echo "❌ PM2 processes vẫn đang dùng NVM"
fi
echo ""
