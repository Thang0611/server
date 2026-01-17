# NVM vs System Node.js cho Production Server

## ⚠️ Kết luận ngắn gọn

**KHÔNG dùng NVM trong Production Server là ỔN ĐỊNH HƠN và được khuyến nghị!**

## So sánh chi tiết

### System Node.js (Cài qua apt/yum/snap) ✅ Khuyến nghị

**Ưu điểm:**
- ✅ **Ổn định cao**: Đường dẫn cố định (`/usr/bin/node`), không phụ thuộc user environment
- ✅ **PM2 startup đơn giản**: Không cần source script, PATH đã có sẵn trong systemd
- ✅ **Tự động khởi động**: Không cần cấu hình thêm cho systemd
- ✅ **Quản lý tập trung**: Package manager quản lý version và updates
- ✅ **Bảo mật tốt hơn**: Được maintain bởi distro, có security updates
- ✅ **Không phụ thuộc user session**: Hoạt động độc lập với user login
- ✅ **Phù hợp production**: Standard practice cho server production

**Nhược điểm:**
- ❌ Version có thể cũ hơn (tùy distro)
- ❌ Ít linh hoạt khi cần switch version

### NVM (Node Version Manager) ❌ Không khuyến nghị cho Production

**Ưu điểm:**
- ✅ Linh hoạt: Dễ dàng switch version Node.js
- ✅ Version mới nhất: Dễ cài version mới
- ✅ Multi-version: Có thể có nhiều version cùng lúc

**Nhược điểm:**
- ❌ **Không ổn định với PM2 startup**: Phụ thuộc shell environment, PATH thay đổi
- ❌ **Phức tạp với systemd**: Cần source `nvm.sh` trong startup script
- ❌ **Rủi ro cao**: Nếu NVM bị xóa hoặc user home bị thay đổi → PM2 không start được
- ❌ **Phụ thuộc user**: NVM ở trong user home (`~/.nvm/`), không system-wide
- ❌ **Debug khó**: Lỗi "node not found" khi reboot khó trace
- ❌ **Không phù hợp production**: Best practice là dùng system package

## Vấn đề thực tế với NVM + PM2

### Vấn đề 1: PM2 startup không tìm thấy Node.js
```bash
# Sau reboot, systemd không source NVM
# → node: command not found
# → PM2 không start được
```

### Vấn đề 2: PATH không nhất quán
```bash
# User login: node từ NVM (~/.nvm/versions/node/v18/bin/node)
# Systemd: node không có trong PATH mặc định
# → Khác nhau giữa manual start và auto-start
```

### Vấn đề 3: Phụ thuộc user environment
```bash
# Nếu user home bị migrate/thay đổi
# Nếu .nvm bị xóa
# → PM2 không hoạt động
```

## Khuyến nghị: Chuyển sang System Node.js

### Cách 1: Dùng NodeSource Repository (Khuyến nghị)

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Kiểm tra
which node
# → /usr/bin/node (system path, không phụ thuộc user)

node --version
npm --version
```

### Cách 2: Dùng Snap (Đơn giản)

```bash
sudo snap install node --classic

# Kiểm tra
which node
# → /snap/bin/node
```

### Cách 3: Dùng Binary từ nodejs.org (Manual)

```bash
# Download và cài vào /usr/local
cd /tmp
wget https://nodejs.org/dist/v18.18.0/node-v18.18.0-linux-x64.tar.xz
tar -xf node-v18.18.0-linux-x64.tar.xz
sudo mv node-v18.18.0-linux-x64 /usr/local/node
sudo ln -s /usr/local/node/bin/node /usr/local/bin/node
sudo ln -s /usr/local/node/bin/npm /usr/local/bin/npm

# Thêm vào PATH trong /etc/environment hoặc /etc/profile
```

## Migration từ NVM sang System Node.js

### Bước 1: Cài System Node.js
```bash
# Cài Node.js system-wide
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
which node
node --version
```

### Bước 2: Kiểm tra version compatibility
```bash
# Đảm bảo version tương thích với project
# Check package.json hoặc .nvmrc nếu có
cat package.json | grep engines
```

### Bước 3: Reinstall PM2 với system Node.js
```bash
# Uninstall PM2 cũ (nếu cài qua NVM)
npm uninstall -g pm2

# Install PM2 với system Node.js
sudo npm install -g pm2

# Verify
which pm2
pm2 --version
```

### Bước 4: Cập nhật PM2 startup
```bash
# Xóa startup script cũ (nếu có)
sudo systemctl disable pm2-root.service
sudo rm /etc/systemd/system/pm2-root.service

# Tạo startup script mới
pm2 startup systemd -u root --hp /root

# Copy và chạy lệnh được output
# Ví dụ: sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root

# Start và save processes
cd /root/project/server
pm2 start ecosystem.config.js
pm2 save

# Enable service
sudo systemctl enable pm2-root.service

# Kiểm tra
systemctl status pm2-root.service
```

### Bước 5: Verify startup script không cần NVM
```bash
# Kiểm tra startup script
sudo cat /etc/systemd/system/pm2-root.service

# Đảm bảo không có reference tới ~/.nvm
# Đảm bảo PATH có /usr/bin hoặc /usr/local/bin
```

### Bước 6: Test reboot (Cẩn thận!)
```bash
# Backup trước
pm2 save

# Test reboot
sudo reboot

# Sau reboot, SSH lại và kiểm tra
pm2 list
systemctl status pm2-root.service
```

### Bước 7: (Tùy chọn) Xóa NVM
```bash
# Chỉ xóa nếu chắc chắn không cần nữa
# Backup trước:
cp -r ~/.nvm ~/.nvm.backup

# Xóa NVM
rm -rf ~/.nvm
# Xóa từ ~/.bashrc hoặc ~/.profile:
sed -i '/nvm/d' ~/.bashrc
sed -i '/nvm/d' ~/.profile
```

## Checklist sau khi chuyển sang System Node.js

- [ ] `which node` → `/usr/bin/node` hoặc `/usr/local/bin/node` (KHÔNG phải `~/.nvm/`)
- [ ] `node --version` → Version đúng
- [ ] `pm2 list` → Hoạt động bình thường
- [ ] `/etc/systemd/system/pm2-root.service` → Không có reference tới `nvm.sh`
- [ ] `systemctl is-enabled pm2-root.service` → `enabled`
- [ ] Test reboot → PM2 tự động start

## Kết luận

**Cho Production Server:**
- ✅ **NÊN**: Dùng System Node.js (apt/yum/snap)
- ❌ **KHÔNG NÊN**: Dùng NVM

**Lý do:**
1. Ổn định và đáng tin cậy hơn
2. PM2 startup hoạt động tự động không cần config phức tạp
3. Phù hợp best practices cho production
4. Dễ maintain và debug
5. Không phụ thuộc user environment

**NVM chỉ nên dùng cho:**
- Development machine
- Local development
- Cần test nhiều version Node.js
- Không phải production server

## Lệnh nhanh để check

```bash
# Check Node.js installation type
which node
# Nếu là: /usr/bin/node hoặc /usr/local/bin/node → System ✅
# Nếu là: /root/.nvm/versions/node/... → NVM ❌

# Check PM2
which pm2
pm2 --version

# Check startup script
sudo cat /etc/systemd/system/pm2-root.service | grep -E "PATH|nvm"
# Không nên có nvm trong PATH
```
