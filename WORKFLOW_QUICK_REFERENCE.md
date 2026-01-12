# 🚀 Download Workflow - Quick Reference Guide

## 📊 System Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SYSTEM ARCHITECTURE                              │
└────────────────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐         ┌──────────────────┐
│   Frontend   │         │   Node.js    │         │  Python Worker   │
│              │◄───────►│   Backend    │◄───────►│  (Standalone)    │
│  (Customer)  │  HTTP   │              │  MySQL  │                  │
└──────────────┘         └──────────────┘         └──────────────────┘
                                │                          │
                                │                          │
                         ┌──────▼──────┐          ┌───────▼────────┐
                         │   MySQL     │          │  Google Drive  │
                         │  Database   │          │   (via rclone) │
                         └─────────────┘          └────────────────┘
```

---

## 🔄 Status Flow

### Order Status Flow
```
pending → paid → (completed/cancelled/refunded)
```

### Download Task Status Flow
```
paid → processing → enrolled → (download happening) → completed/failed
```

---

## 📁 Key Files Reference

### Node.js Backend

| File | Purpose | Key Functions |
|------|---------|---------------|
| `src/controllers/payment.controller.js` | Payment webhook handler | `handleWebhook()` - Receives SePay notifications |
| `src/services/payment.service.js` | Payment business logic | `createOrder()`, `processPaymentWebhook()` |
| `src/services/download.service.js` | Download task management | `createDownloadTasks()`, `processOrder()` |
| `src/workers/download.worker.js` | Node.js worker (enrollment) | `processTask()` - Enrolls user in Udemy |
| `src/controllers/webhook.controller.js` | Finalize webhook | `finalizeDownload()` - Called by Python |
| `src/services/webhook.service.js` | Webhook business logic | Grants Drive access, sends email |
| `src/utils/drive.util.js` | Google Drive API | `findFolderByName()`, `grantReadAccess()` |

### Python Worker

| File | Purpose | Key Functions |
|------|---------|---------------|
| `udemy_dl/worker.py` | Main worker loop | `main()` - Polls DB, downloads courses |
| `udemy_dl/main.py` | Udemy downloader | Command-line tool for downloading |
| `udemy_dl/utils.py` | Helper utilities | Course parsing, URL handling |

---

## 🔑 Environment Variables

### Required in `.env`

#### Node.js Variables
```bash
# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=database_name

# Payment Gateway
SEPAY_API_KEY=your_sepay_key

# Email Service
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password

# Security
API_SECRET_KEY=your_secret_key_2025

# Google Drive
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

#### Python Variables (Same `.env` file)
```bash
# Shared Database Config
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=database_name

# Udemy Authentication
UDEMY_TOKEN=your_bearer_token

# Webhook Authentication
API_SECRET_KEY=your_secret_key_2025
```

---

## 📡 API Endpoints

### Public Endpoints

```
POST /api/v1/payment/create-order
  Body: { email, courses[] }
  Response: { orderCode, qrCodeUrl, ... }

GET /api/v1/payment/check-status/:orderCode
  Response: { status: 'pending'|'paid' }
```

### Webhook Endpoints (Internal)

```
POST /api/v1/payment/webhook
  Headers: Authorization: Apikey ${SEPAY_API_KEY}
  Body: { code, transferAmount, ... }
  Caller: SePay Payment Gateway

POST /api/v1/webhook/finalize
  Body: { secret_key, task_id, folder_name }
  Caller: Python Worker
```

---

## 🗄️ Database Schema

### `orders` Table
```sql
id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY
order_code      VARCHAR(50) UNIQUE NOT NULL  -- e.g., "DH123456"
user_email      VARCHAR(255) NOT NULL
total_amount    DECIMAL(15,0) NOT NULL
payment_status  ENUM('pending','paid','cancelled','refunded')
payment_gateway_data JSON
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

### `download_tasks` Table
```sql
id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY
order_id        INT UNSIGNED (FK → orders.id)
email           VARCHAR(255) NOT NULL
phone_number    VARCHAR(20)
course_url      TEXT NOT NULL
title           VARCHAR(255)
price           DECIMAL(15,0)
status          ENUM('paid','pending','processing','enrolled','completed','failed')
drive_link      TEXT
retry_count     INT DEFAULT 0
error_log       TEXT
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

---

## 🔄 Step-by-Step Process

### Phase 1: Order Creation
```
1. Customer submits courses
2. Node.js creates Order (status: pending)
3. Node.js creates DownloadTasks (status: paid)
4. Return QR code to customer
```

### Phase 2: Payment Confirmation
```
5. Customer pays via banking app
6. SePay sends webhook to Node.js
7. Node.js verifies payment amount
8. Update Order.payment_status = 'paid'
9. Update DownloadTasks.status = 'processing'
```

### Phase 3: Enrollment (Node.js Worker)
```
10. downloadWorker.processTask() called
11. Enroll customer in Udemy course (via API)
12. Update DownloadTasks.status = 'enrolled'
```

### Phase 4: Download (Python Worker)
```
13. Python polls for tasks with status='enrolled'
14. Update status='processing' (claim task)
15. Run main.py to download course
16. Upload to Google Drive via rclone
17. Update DB status='completed'
```

### Phase 5: Finalization (Python → Node.js)
```
18. Python calls /api/v1/webhook/finalize
19. Node.js finds Drive folder (retry 10x)
20. Grant read access to customer email
21. Update DownloadTasks.driver_url
22. Send email with Drive link to customer
```

---

## ⚡ Common Commands

### Start Python Worker
```bash
cd /root/server/udemy_dl
python3 worker.py
```

### Check Worker Status
```bash
# Check if running
ps aux | grep worker.py

# View logs (if using systemd)
journalctl -u udemy-worker.service -f
```

### Manual Database Queries

```sql
-- Check pending orders
SELECT * FROM orders WHERE payment_status = 'pending';

-- Check active tasks
SELECT id, email, status, course_url 
FROM download_tasks 
WHERE status IN ('processing', 'enrolled') 
ORDER BY created_at;

-- Reset stuck tasks
UPDATE download_tasks 
SET status = 'enrolled' 
WHERE status = 'processing' AND updated_at < NOW() - INTERVAL 2 HOUR;

-- Failed task statistics
SELECT status, COUNT(*) 
FROM download_tasks 
GROUP BY status;
```

### Rclone Commands

```bash
# List remote drives
rclone listremotes

# Check upload destination
rclone ls gdrive:UdemyCourses/download_khoahoc

# Manual upload
rclone move ./Staging_Download/Course_Name gdrive:UdemyCourses/download_khoahoc/Course_Name
```

---

## 🐛 Troubleshooting

### Python Worker Not Processing Tasks

**Symptom:** Tasks stuck in 'enrolled' status

**Check:**
```bash
# Is worker running?
ps aux | grep worker.py

# Check worker logs
tail -f /var/log/udemy-worker.log

# Check database connection
mysql -u root -p -e "SELECT 1"
```

**Fix:**
```bash
# Restart worker
pkill -f worker.py
cd /root/server/udemy_dl && python3 worker.py &
```

---

### Download Fails with "No bearer token"

**Symptom:** Python worker errors: "No bearer token was provided"

**Check:**
```bash
# Is UDEMY_TOKEN set in .env?
grep UDEMY_TOKEN /root/server/.env

# Test token validity
curl -H "Authorization: Bearer ${UDEMY_TOKEN}" \
  https://www.udemy.com/api-2.0/users/me/
```

**Fix:**
```bash
# Update .env with valid token
echo "UDEMY_TOKEN=your_new_token" >> /root/server/.env

# Restart worker
pkill -f worker.py
cd /root/server/udemy_dl && python3 worker.py &
```

---

### Drive Upload Fails

**Symptom:** "rclone: command not found" or upload timeouts

**Check:**
```bash
# Is rclone installed?
which rclone

# Test rclone config
rclone config show gdrive

# Test connection
rclone lsd gdrive:
```

**Fix:**
```bash
# Install rclone
curl https://rclone.org/install.sh | sudo bash

# Configure rclone
rclone config
# Select: Google Drive, name it 'gdrive'
```

---

### Webhook Not Receiving Calls

**Symptom:** No email sent after download completes

**Check:**
```bash
# Check Node.js server logs
pm2 logs server

# Test webhook manually
curl -X POST http://localhost:3000/api/v1/webhook/finalize \
  -H "Content-Type: application/json" \
  -d '{
    "secret_key": "your_secret",
    "task_id": 1,
    "folder_name": "Test Course"
  }'
```

**Fix:**
```bash
# Check API_SECRET_KEY matches in .env
grep API_SECRET_KEY /root/server/.env

# Check firewall
sudo ufw allow 3000/tcp
```

---

## 📞 Monitoring Checklist

### Daily Checks
- [ ] Python worker is running (`ps aux | grep worker.py`)
- [ ] No tasks stuck in 'processing' > 4 hours
- [ ] Node.js server is responding (`curl localhost:3000`)
- [ ] Disk space > 20% free (`df -h`)

### Weekly Checks
- [ ] Database backup exists
- [ ] Failed tasks < 5% of total
- [ ] Email service is working (test send)
- [ ] Drive quota < 80% used

---

## 🔐 Security Notes

1. **Never commit `.env` to git**
   ```bash
   git update-index --assume-unchanged .env
   ```

2. **Rotate API_SECRET_KEY quarterly**
   ```bash
   # Generate new key
   openssl rand -hex 32
   # Update in .env and restart services
   ```

3. **Limit database user permissions**
   ```sql
   GRANT SELECT, UPDATE ON database.download_tasks TO 'worker'@'%';
   ```

4. **Monitor for unauthorized access**
   ```bash
   # Check failed login attempts
   grep "Failed" /var/log/auth.log
   ```

---

## 📚 Related Documentation

- Full Analysis: `DOWNLOAD_WORKFLOW_ANALYSIS.md`
- API Documentation: `postman/README.md`
- Implementation Summary: `IMPLEMENTATION_SUMMARY.md`

---

**Last Updated:** January 12, 2026  
**Version:** 1.0  
**Maintainer:** System Administrator
