# Phân tích PM2 Startup và NVM Issues

## 🔍 Tình trạng hiện tại

### 1. PM2 đang sử dụng NVM
- **Runtime Binary**: `/root/.nvm/versions/node/v24.12.0/bin/node`
- **Node.js version**: v24.12.0 (từ NVM)
- **PM2 location**: `/usr/local/bin/pm2` (system-wide)
- **Service file**: `/etc/systemd/system/pm2-root.service`

### 2. System Node.js có sẵn nhưng version cũ
- **System Node.js**: `/usr/bin/node` → v12.22.9 (rất cũ)
- **Không tương thích**: Project đang dùng Node v24.12.0, system chỉ có v12.22.9

### 3. PM2 Startup Service Configuration
```bash
# File: /etc/systemd/system/pm2-root.service
Environment=PATH=...:/root/.nvm/versions/node/v24.12.0/bin:...
```

## ⚠️ Vấn đề phát hiện

### Vấn đề 1: PM2 phụ thuộc NVM trong PATH
- Service file có hardcode PATH tới NVM: `/root/.nvm/versions/node/v24.12.0/bin`
- Nếu NVM bị xóa hoặc user home thay đổi → PM2 không start được
- Sau reboot, systemd cần PATH này để tìm node

### Vấn đề 2: System Node.js quá cũ
- System có Node.js v12.22.9 (từ 2021)
- Project cần Node.js v24.12.0
- Không thể chuyển sang system Node.js vì version không tương thích

### Vấn đề 3: PM2 startup có thể fail nếu NVM không load
- Khi reboot, systemd không tự động source NVM
- PATH trong service file có NVM nhưng nếu NVM chưa được init → node không tìm thấy
- Có thể gây lỗi "node: command not found" khi reboot

## 📊 Log Analysis

### PM2 Logs cho thấy:
```
Runtime Binary: /root/.nvm/versions/node/v24.12.0/bin/node
```

### Systemd Journal cho thấy:
- PM2 service đã start thành công sau reboot (21:41:47)
- Processes được restore từ dump.pm2
- Tất cả apps đã online

### Tuy nhiên:
- Service file có hardcode PATH tới NVM
- Nếu NVM bị xóa hoặc không load được → PM2 sẽ fail

## 🔧 Giải pháp đề xuất

### Giải pháp 1: Cài System Node.js v24 (Khuyến nghị)

**Bước 1: Cài Node.js v24 từ NodeSource**
```bash
# Cài Node.js v24 system-wide
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
which node
# → /usr/bin/node
node --version
# → v24.x.x
```

**Bước 2: Reinstall PM2 với system Node.js**
```bash
# Uninstall PM2 cũ
npm uninstall -g pm2

# Install PM2 với system Node.js
sudo npm install -g pm2

# Verify
which pm2
# → /usr/local/bin/pm2
pm2 --version
```

**Bước 3: Cập nhật PM2 startup (loại bỏ NVM)**
```bash
# Xóa startup script cũ
sudo systemctl disable pm2-root.service
sudo rm /etc/systemd/system/pm2-root.service

# Tạo startup script mới (không có NVM)
pm2 startup systemd -u root --hp /root

# Copy và chạy lệnh được output
# Ví dụ: sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root

# Verify startup script không có NVM
sudo cat /etc/systemd/system/pm2-root.service | grep -i nvm
# → Không có output (OK)
```

**Bước 4: Restart PM2 với system Node.js**
```bash
cd /root/project/server

# Stop và delete processes cũ
pm2 delete all

# Start lại với ecosystem
pm2 start ecosystem.config.js

# Save processes
pm2 save

# Enable service
sudo systemctl enable pm2-root.service

# Test
sudo systemctl status pm2-root.service
```

**Bước 5: Verify**
```bash
# Kiểm tra node path
which node
# → /usr/bin/node (KHÔNG phải ~/.nvm/)

# Kiểm tra PM2 runtime
pm2 info api | grep "exec path"
# → Phải dùng /usr/bin/node

# Kiểm tra startup script
sudo cat /etc/systemd/system/pm2-root.service | grep PATH
# → PATH phải có /usr/bin, KHÔNG có ~/.nvm/
```

### Giải pháp 2: Giữ NVM nhưng cải thiện startup (Tạm thời)

Nếu chưa thể chuyển sang system Node.js ngay:

**Bước 1: Đảm bảo NVM được init trong startup script**
```bash
# Backup service file
sudo cp /etc/systemd/system/pm2-root.service /etc/systemd/system/pm2-root.service.backup

# Edit service file
sudo nano /etc/systemd/system/pm2-root.service
```

**Thêm vào [Service] section:**
```ini
[Service]
# ... existing config ...
Environment="NVM_DIR=/root/.nvm"
ExecStartPre=/bin/bash -c 'source /root/.nvm/nvm.sh && nvm use 24.12.0'
ExecStart=/usr/local/lib/node_modules/pm2/bin/pm2 resurrect
```

**Bước 2: Reload systemd**
```bash
sudo systemctl daemon-reload
sudo systemctl restart pm2-root.service
```

**⚠️ Lưu ý**: Giải pháp này vẫn phụ thuộc NVM, không ổn định bằng system Node.js

## 🧪 Test sau khi fix

### Test 1: Kiểm tra PM2 startup
```bash
# Restart service
sudo systemctl restart pm2-root.service

# Kiểm tra status
sudo systemctl status pm2-root.service
pm2 list
```

### Test 2: Test reboot (Cẩn thận!)
```bash
# Backup trước
pm2 save

# Test reboot
sudo reboot

# Sau reboot, SSH lại và kiểm tra
pm2 list
systemctl status pm2-root.service
```

### Test 3: Kiểm tra không phụ thuộc NVM
```bash
# Tạm thời disable NVM
mv ~/.nvm ~/.nvm.backup

# Restart PM2 service
sudo systemctl restart pm2-root.service

# Nếu vẫn hoạt động → OK (đã chuyển sang system Node.js)
# Nếu fail → Vẫn phụ thuộc NVM

# Restore NVM
mv ~/.nvm.backup ~/.nvm
```

## 📝 Checklist

Sau khi áp dụng giải pháp:

- [x] `which node` → `/usr/bin/node` (KHÔNG phải `~/.nvm/`) ✅
- [x] `node --version` → v24.13.0 (tương thích với project) ✅
- [x] `pm2 list` → Tất cả processes online ✅
- [x] `/etc/systemd/system/pm2-root.service` → KHÔNG có reference tới `nvm` ✅
- [x] `systemctl is-enabled pm2-root.service` → `enabled` ✅
- [x] Test service restart → PM2 tự động start ✅
- [x] Processes đang dùng `/usr/bin/node` ✅

## ✅ Kết quả Implementation (16/01/2026)

**Đã hoàn thành:**
1. ✅ Cài Node.js v24.13.0 system-wide từ NodeSource
2. ✅ Reinstall PM2 với system Node.js
3. ✅ Cập nhật PM2 startup script (loại bỏ NVM)
4. ✅ Restart PM2 processes với system Node.js
5. ✅ Test service restart - PASSED

**Verification:**
- Node.js path: `/usr/bin/node` (system)
- Node.js version: `v24.13.0`
- PM2 path: `/usr/local/lib/node_modules/pm2/bin/pm2`
- Processes đang dùng: `/usr/bin/node` ✅
- Startup script: Không có NVM ✅
- Service status: `enabled` và `active (running)` ✅

## 🎯 Kết luận

**Vấn đề chính:**
1. PM2 đang phụ thuộc NVM trong startup service
2. System Node.js quá cũ (v12) không tương thích với project (v24)
3. Cần cài Node.js v24 system-wide và chuyển PM2 sang dùng system Node.js

**Khuyến nghị:**
- ✅ **NÊN**: Cài Node.js v24 system-wide và chuyển PM2 sang system Node.js
- ❌ **KHÔNG NÊN**: Tiếp tục dùng NVM cho production server

**Lý do:**
- Ổn định và đáng tin cậy hơn
- PM2 startup hoạt động tự động không cần config phức tạp
- Phù hợp best practices cho production
- Dễ maintain và debug
