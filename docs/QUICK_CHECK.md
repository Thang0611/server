# Hướng dẫn kiểm tra nhanh Node.js/NPM installation

## Kiểm tra nhanh

Chạy các lệnh sau để kiểm tra:

```bash
# 1. Kiểm tra đường dẫn Node.js
which node
node --version

# 2. Kiểm tra đường dẫn npm
which npm
npm --version

# 3. Kiểm tra PM2
which pm2
pm2 --version

# 4. Kiểm tra NVM có tồn tại không
ls -la ~/.nvm/nvm.sh 2>/dev/null && echo "NVM found" || echo "NVM not found"

# 5. Kiểm tra system Node.js package
dpkg -l | grep -i nodejs
```

## Phân tích kết quả

### ✅ System Node.js (Tốt cho production):
- `which node` → `/usr/bin/node` hoặc `/usr/local/bin/node` hoặc `/snap/bin/node`
- `which npm` → `/usr/bin/npm` hoặc `/usr/local/bin/npm` hoặc `/snap/bin/npm`
- **KHÔNG** có `~/.nvm/` trong path

### ❌ NVM (Cần migration):
- `which node` → `/root/.nvm/versions/node/vXX.XX.XX/bin/node`
- `which npm` → `/root/.nvm/versions/node/vXX.XX.XX/bin/npm`
- Có `~/.nvm/` trong path

## Nếu bạn thấy npm -v = 11.6.2

Điều này chỉ cho biết version, không cho biết installation type.

**Cần kiểm tra thêm:**
```bash
which npm
```

**Nếu kết quả là:**
- `/usr/bin/npm` → ✅ System npm (OK)
- `/usr/local/bin/npm` → ✅ System npm (OK)
- `/root/.nvm/versions/node/.../bin/npm` → ❌ NVM npm (Cần chuyển)

## Chạy script kiểm tra tự động

```bash
bash /root/project/server/scripts/quick_check_node.sh
```

Script này sẽ tự động:
- Kiểm tra Node.js path và version
- Kiểm tra npm path và version
- Kiểm tra PM2 path
- Kiểm tra NVM có tồn tại không
- Đưa ra kết luận và khuyến nghị

## Nếu đang dùng NVM - Migration

Nếu phát hiện đang dùng NVM, chạy migration script:

```bash
bash /root/project/server/scripts/migrate_to_system_nodejs.sh
```

Script sẽ tự động:
1. Backup PM2 processes
2. Cài System Node.js
3. Reinstall PM2
4. Cập nhật PM2 startup
5. Verify installation
