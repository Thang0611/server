# 📦 HƯỚNG DẪN BACKUP VÀ RESTORE SERVER

## 📋 TỔNG QUAN

Hệ thống backup bao gồm:
- **Database Backup**: Backup MySQL database (structure + data)
- **Server Backup**: Backup code, config files, và các files quan trọng
- **Automated Backup**: Tự động backup theo lịch (cron)

---

## 🚀 CÁCH SỬ DỤNG

### **1. Backup Database**

```bash
# Backup database (full backup)
cd /root/project/server
./scripts/backup/backup-database.sh

# Backup với compression (tiết kiệm dung lượng)
./scripts/backup/backup-database.sh --compress

# Backup chỉ data (không có structure)
./scripts/backup/backup-database.sh --data-only
```

**Output**: `backup/database/YYYY-MM-DD_HH-MM-SS_database.sql[.gz]`

---

### **2. Backup Server Files**

```bash
# Backup server files (full)
./scripts/backup/backup-server.sh

# Backup không bao gồm logs (tiết kiệm dung lượng)
./scripts/backup/backup-server.sh --exclude-logs

# Backup không bao gồm node_modules (có thể npm install lại)
./scripts/backup/backup-server.sh --exclude-node-modules

# Backup tối ưu (không logs, không node_modules)
./scripts/backup/backup-server.sh --exclude-logs --exclude-node-modules
```

**Output**: `backup/server/YYYY-MM-DD_HH-MM-SS_server.tar.gz`

**Files được backup**:
- `src/` - Source code
- `scripts/` - Scripts
- `udemy_dl/` - Python downloader
- `server.js` - Main server file
- `package.json` - Dependencies
- `.env` - Environment variables
- `ecosystem.config.js` - PM2 config
- `nginx-*.conf` - Nginx configs
- `cookies.txt` - Udemy cookies
- `service-account.json` - Google Drive credentials
- `postman/` - Postman collections
- `docs/` - Documentation

**Files KHÔNG được backup**:
- `node_modules/` - Có thể npm install lại
- `logs/` - Log files (có thể exclude)
- `backup/` - Backup directory
- `.git/` - Git directory
- `Staging_Download/` - Temporary download files

---

### **3. Full Backup (Database + Server)**

```bash
# Backup cả database và server files
./scripts/backup/backup-full.sh

# Với compression và exclude logs/node_modules
./scripts/backup/backup-full.sh --compress --exclude-logs --exclude-node-modules
```

---

### **4. Restore Database**

```bash
# Restore từ backup file
./scripts/backup/restore-database.sh backup/database/2026-01-18_10-30-00_database.sql.gz

# Restore từ uncompressed backup
./scripts/backup/restore-database.sh backup/database/2026-01-18_10-30-00_database.sql
```

**⚠️ CẢNH BÁO**: Restore sẽ **THAY THẾ** toàn bộ data trong database. Đảm bảo có backup trước khi restore!

---

### **5. Restore Server Files**

```bash
# Restore server files
./scripts/backup/restore-server.sh backup/server/2026-01-18_10-30-00_server.tar.gz

# Restore vào thư mục khác
./scripts/backup/restore-server.sh backup/server/2026-01-18_10-30-00_server.tar.gz --target-dir=/path/to/restore
```

**Sau khi restore**:
1. Review restored files
2. Install dependencies: `npm install`
3. Update `.env` file với values đúng
4. Restart services: `pm2 restart all`

---

### **6. Setup Automated Backup**

```bash
# Setup daily backup (2:00 AM mỗi ngày)
./scripts/backup/setup-auto-backup.sh --daily

# Setup hourly backup
./scripts/backup/setup-auto-backup.sh --hourly

# Setup weekly backup (Chủ nhật 2:00 AM)
./scripts/backup/setup-auto-backup.sh --weekly
```

**Xem backup logs**:
```bash
tail -f logs/backup.log
```

**Xem cron jobs**:
```bash
crontab -l
```

**Xóa automated backup**:
```bash
crontab -l | grep -v "backup-full.sh" | crontab -
```

---

## 📁 CẤU TRÚC BACKUP

```
backup/
├── database/
│   ├── 2026-01-18_10-30-00_database.sql.gz
│   ├── 2026-01-19_10-30-00_database.sql.gz
│   └── ...
└── server/
    ├── 2026-01-18_10-30-00_server.tar.gz
    ├── 2026-01-19_10-30-00_server.tar.gz
    └── ...
```

---

## ⚙️ CẤU HÌNH

### **Environment Variables** (`.env`)

```bash
# Database config (đã có sẵn)
DB_HOST=localhost
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=your_database

# Backup config (optional)
BACKUP_KEEP_DAYS=30  # Giữ backup trong 30 ngày (mặc định)
```

---

## 🔄 QUY TRÌNH RESTORE KHI SERVER HỎNG

### **Bước 1: Setup Server Mới**

```bash
# 1. Install dependencies
sudo apt update
sudo apt install -y nodejs npm python3 python3-pip mysql-client nginx

# 2. Clone hoặc copy code
git clone <repo> /root/project/server
# HOẶC
scp -r backup/server/2026-01-18_10-30-00_server.tar.gz user@new-server:/root/
tar -xzf 2026-01-18_10-30-00_server.tar.gz -C /root/project/server
```

### **Bước 2: Restore Database**

```bash
# 1. Create database
mysql -u root -p
CREATE DATABASE your_database CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;

# 2. Restore từ backup
cd /root/project/server
./scripts/backup/restore-database.sh backup/database/2026-01-18_10-30-00_database.sql.gz
```

### **Bước 3: Restore Server Files**

```bash
# 1. Restore files
./scripts/backup/restore-server.sh backup/server/2026-01-18_10-30-00_server.tar.gz

# 2. Install dependencies
npm install
cd udemy_dl && pip3 install -r requirements.txt

# 3. Update .env
nano .env
# Update: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, etc.

# 4. Setup PM2
pm2 start ecosystem.config.js
pm2 save
```

### **Bước 4: Setup Nginx**

```bash
# 1. Copy nginx config
sudo cp nginx-getcourses.conf /etc/nginx/sites-available/getcourses.net
sudo ln -s /etc/nginx/sites-available/getcourses.net /etc/nginx/sites-enabled/

# 2. Test và reload
sudo nginx -t
sudo systemctl reload nginx
```

### **Bước 5: Verify**

```bash
# 1. Check services
pm2 list
pm2 logs

# 2. Test API
curl https://api.getcourses.net/

# 3. Test frontend
curl https://getcourses.net/
```

---

## 💾 BACKUP TO EXTERNAL STORAGE

### **Option 1: SCP to Another Server**

```bash
# Copy backups to another server
scp -r backup/ user@backup-server:/backup/getcourses/
```

### **Option 2: Google Drive (rclone)**

```bash
# Setup rclone (nếu chưa có)
rclone config

# Upload backups
rclone copy backup/ gdrive:backups/getcourses/ -P
```

### **Option 3: AWS S3**

```bash
# Install AWS CLI
sudo apt install awscli

# Configure
aws configure

# Upload
aws s3 sync backup/ s3://your-bucket/backups/getcourses/
```

### **Option 4: Automated Cloud Backup Script**

Tạo script `scripts/backup/upload-to-cloud.sh`:

```bash
#!/bin/bash
# Upload latest backups to cloud storage

BACKUP_DIR="/root/project/server/backup"
LATEST_DB=$(ls -t $BACKUP_DIR/database/*.sql.gz | head -1)
LATEST_SERVER=$(ls -t $BACKUP_DIR/server/*.tar.gz | head -1)

# Upload to Google Drive
rclone copy "$LATEST_DB" gdrive:backups/getcourses/database/ -P
rclone copy "$LATEST_SERVER" gdrive:backups/getcourses/server/ -P

echo "✅ Backups uploaded to cloud"
```

---

## 📊 MONITORING BACKUPS

### **Check Backup Status**

```bash
# List recent backups
ls -lh backup/database/ | tail -10
ls -lh backup/server/ | tail -10

# Check backup sizes
du -sh backup/database/
du -sh backup/server/

# Check backup logs
tail -f logs/backup.log
```

### **Verify Backup Integrity**

```bash
# Test database backup (không restore)
gunzip -c backup/database/2026-01-18_10-30-00_database.sql.gz | head -100

# Test server backup (list contents)
tar -tzf backup/server/2026-01-18_10-30-00_server.tar.gz | head -20
```

---

## 🔐 SECURITY BEST PRACTICES

1. **Encrypt Backups**: Sử dụng encryption cho sensitive data
2. **Offsite Backup**: Copy backups ra server khác hoặc cloud
3. **Test Restore**: Định kỳ test restore để đảm bảo backup hoạt động
4. **Access Control**: Giới hạn quyền truy cập backup files
5. **Rotation**: Tự động xóa backups cũ (đã có sẵn trong script)

---

## ⚠️ LƯU Ý QUAN TRỌNG

1. **Backup thường xuyên**: Ít nhất 1 lần/ngày
2. **Test restore**: Test restore ít nhất 1 lần/tháng
3. **Offsite backup**: Luôn có backup ở nơi khác server
4. **Monitor disk space**: Đảm bảo đủ dung lượng cho backups
5. **Document restore process**: Ghi lại quy trình restore

---

## 🆘 TROUBLESHOOTING

### **Backup fails với "Permission denied"**

```bash
# Fix permissions
chmod +x scripts/backup/*.sh
chmod 600 .env  # Protect .env file
```

### **Backup fails với "Database connection error"**

```bash
# Check database credentials
mysql -h $DB_HOST -u $DB_USER -p$DB_PASSWORD -e "SELECT 1;"
```

### **Backup file quá lớn**

```bash
# Sử dụng compression
./scripts/backup/backup-database.sh --compress
./scripts/backup/backup-server.sh --exclude-logs --exclude-node-modules
```

### **Restore fails với "Table already exists"**

```bash
# Drop database và tạo lại
mysql -u root -p
DROP DATABASE your_database;
CREATE DATABASE your_database CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
# Sau đó restore lại
```

---

## 📞 SUPPORT

Nếu gặp vấn đề, check:
1. Backup logs: `logs/backup.log`
2. Database logs: `logs/backend-error.log`
3. System logs: `journalctl -u nginx`, `pm2 logs`
