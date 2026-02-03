# 🚀 BACKUP QUICK START GUIDE

## ⚡ Backup Ngay (1 Lệnh)

```bash
cd /root/project/server
./scripts/backup/backup-full.sh --compress --exclude-logs --exclude-node-modules
```

**Kết quả**:
- Database backup: `backup/database/YYYY-MM-DD_HH-MM-SS_database.sql.gz`
- Server backup: `backup/server/YYYY-MM-DD_HH-MM-SS_server.tar.gz`

---

## 🔄 Setup Tự Động Backup

```bash
# Backup hàng ngày lúc 2:00 AM
./scripts/backup/setup-auto-backup.sh --daily
```

**Kiểm tra**:
```bash
# Xem cron jobs
crontab -l

# Xem backup logs
tail -f logs/backup.log
```

---

## 📦 Restore Khi Server Hỏng

### **Bước 1: Restore Database**

```bash
# List backups
ls -lh backup/database/

# Restore
./scripts/backup/restore-database.sh backup/database/2026-01-19_10-29-20_database.sql.gz
```

### **Bước 2: Restore Server Files**

```bash
# List backups
ls -lh backup/server/

# Restore
./scripts/backup/restore-server.sh backup/server/2026-01-19_10-29-29_server.tar.gz

# Install dependencies
npm install
cd udemy_dl && pip3 install -r requirements.txt

# Update .env
nano .env

# Restart services
pm2 restart all
```

---

## ☁️ Upload Lên Cloud (Khuyến Nghị)

```bash
# Upload lên Google Drive (cần setup rclone trước)
./scripts/backup/upload-to-cloud.sh --provider=gdrive

# Hoặc upload lên AWS S3
./scripts/backup/upload-to-cloud.sh --provider=s3 --s3-bucket=your-bucket
```

**Setup rclone**:
```bash
sudo apt install rclone
rclone config
# Chọn Google Drive và follow instructions
```

---

## 📊 Kiểm Tra Backups

```bash
# List recent backups
ls -lh backup/database/ | tail -5
ls -lh backup/server/ | tail -5

# Check backup sizes
du -sh backup/database/
du -sh backup/server/

# Verify backup integrity
gunzip -c backup/database/2026-01-19_10-29-20_database.sql.gz | head -50
tar -tzf backup/server/2026-01-19_10-29-29_server.tar.gz | head -20
```

---

## ⚙️ Cấu Hình

Thêm vào `.env`:

```bash
# Giữ backup trong 30 ngày (mặc định)
BACKUP_KEEP_DAYS=30
```

---

## 📖 Chi Tiết

Xem `BACKUP_GUIDE.md` để biết hướng dẫn đầy đủ.
