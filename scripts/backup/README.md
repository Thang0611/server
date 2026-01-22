# 📦 Backup Scripts - Quick Start

## 🚀 Quick Commands

### **Backup Ngay**

```bash
# Backup đầy đủ (database + server)
cd /root/project/server
./scripts/backup/backup-full.sh --compress --exclude-logs --exclude-node-modules
```

### **Setup Tự Động Backup Hàng Ngày**

```bash
# Setup daily backup lúc 2:00 AM
./scripts/backup/setup-auto-backup.sh --daily
```

### **Restore Khi Cần**

```bash
# Restore database
./scripts/backup/restore-database.sh backup/database/YYYY-MM-DD_HH-MM-SS_database.sql.gz

# Restore server files
./scripts/backup/restore-server.sh backup/server/YYYY-MM-DD_HH-MM-SS_server.tar.gz
```

---

## 📋 Scripts Available

| Script | Mô tả |
|--------|-------|
| `backup-database.sh` | Backup MySQL database |
| `backup-server.sh` | Backup server files (code, config) |
| `backup-full.sh` | Backup cả database và server |
| `restore-database.sh` | Restore database từ backup |
| `restore-server.sh` | Restore server files từ backup |
| `setup-auto-backup.sh` | Setup automated backup với cron |
| `upload-to-cloud.sh` | Upload backups lên Google Drive/S3 |

---

## 📁 Backup Locations

- **Database**: `backup/database/`
- **Server**: `backup/server/`
- **Logs**: `logs/backup.log`

---

## ⚙️ Configuration

Thêm vào `.env`:

```bash
# Giữ backup trong 30 ngày (mặc định)
BACKUP_KEEP_DAYS=30
```

---

## 📖 Chi Tiết

Xem file `BACKUP_GUIDE.md` để biết hướng dẫn chi tiết.
