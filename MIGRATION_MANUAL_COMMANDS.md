# Manual Migration Commands

If you prefer to run the migration **step-by-step manually** instead of using the automated script, follow these commands:

---

## ⚠️ Pre-Migration Backup

```bash
# Backup current PM2 processes
pm2 save

# Backup PM2 list
pm2 jlist > pm2_backup_$(date +%Y%m%d_%H%M%S).json
```

---

## Step 1: Stop Systemd Service

```bash
# Check current status
sudo systemctl status udemy-worker-rq

# Stop the service
sudo systemctl stop udemy-worker-rq

# Disable auto-start on boot
sudo systemctl disable udemy-worker-rq

# Verify it's stopped
sudo systemctl status udemy-worker-rq
```

---

## Step 2: Kill Lingering Python Processes

```bash
# Find all worker_rq.py processes
ps aux | grep worker_rq.py

# Kill gracefully
pkill -f worker_rq.py

# Wait 5 seconds
sleep 5

# Force kill if still running
pkill -9 -f worker_rq.py

# Also kill old worker.py if exists
pkill -f "worker.py"
pkill -9 -f "worker.py"

# Verify no Python workers are running
ps aux | grep -E "(worker_rq|worker\.py)"
```

---

## Step 3: Clean Up Old PM2 Processes

```bash
# List current processes
pm2 list

# Delete old udemy-worker (if exists)
pm2 delete udemy-worker

# Optional: Also delete udemy-api and client-nextjs (they will be recreated)
pm2 delete udemy-api
pm2 delete client-nextjs

# Verify deletion
pm2 list
```

---

## Step 4: Create Logs Directory

```bash
# Create logs directory if it doesn't exist
cd /root/server
mkdir -p logs
ls -la logs/
```

---

## Step 5: Verify ecosystem.config.js

```bash
# Check the config file exists
ls -lh ecosystem.config.js

# Preview the configuration
cat ecosystem.config.js | head -50
```

---

## Step 6: Start PM2 Ecosystem

```bash
# Navigate to project root
cd /root/server

# Start all services
pm2 start ecosystem.config.js

# Wait 5 seconds for initialization
sleep 5

# Check status
pm2 list
```

Expected output:
```
┌─────┬─────────────────────┬─────────┬─────────┬──────────┐
│ id  │ name                │ mode    │ status  │ cpu      │
├─────┼─────────────────────┼─────────┼─────────┼──────────┤
│ 0   │ backend             │ cluster │ online  │ 0%       │
│ 1   │ backend             │ cluster │ online  │ 0%       │
│ 2   │ client-nextjs       │ cluster │ online  │ 0%       │
│ 3   │ udemy-dl-workers    │ fork    │ online  │ 0%       │
│ 4   │ udemy-dl-workers    │ fork    │ online  │ 0%       │
│ 5   │ udemy-dl-workers    │ fork    │ online  │ 0%       │
│ 6   │ udemy-dl-workers    │ fork    │ online  │ 0%       │
│ 7   │ udemy-dl-workers    │ fork    │ online  │ 0%       │
└─────┴─────────────────────┴─────────┴─────────┴──────────┘
```

---

## Step 7: Save PM2 Configuration

```bash
# Save current process list
pm2 save

# Generate startup script
pm2 startup

# Copy and run the command that PM2 displays (it will look like this):
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root

# Verify PM2 will auto-start on reboot
systemctl status pm2-root
```

---

## Step 8: Verification

```bash
# Check all processes are online
pm2 list

# Check logs
pm2 logs --lines 20

# Check backend logs
pm2 logs backend --lines 10

# Check worker logs
pm2 logs udemy-dl-workers --lines 10

# Test Redis connection
redis-cli ping
redis-cli LLEN rq:queue:downloads

# Test backend API
curl -s http://localhost:3000 | head -10

# Test Next.js
curl -s http://localhost:3001 | head -10
```

---

## Step 9: Monitor (Optional)

```bash
# Real-time monitoring dashboard
pm2 monit

# Watch logs in real-time
pm2 logs --raw

# Check memory usage
pm2 status
free -h

# Check disk space
df -h
du -sh /root/server/Staging_Download/
```

---

## 🔄 If Something Goes Wrong

### Rollback to Systemd

```bash
# Stop all PM2 processes
pm2 stop all
pm2 delete all

# Re-enable systemd
sudo systemctl enable udemy-worker-rq
sudo systemctl start udemy-worker-rq

# Check status
sudo systemctl status udemy-worker-rq
```

### Restart Individual Service

```bash
# Restart backend only
pm2 restart backend

# Restart workers only
pm2 restart udemy-dl-workers

# Restart with zero-downtime (backend only)
pm2 reload backend
```

### View Detailed Logs

```bash
# Last 100 lines
pm2 logs --lines 100

# Only errors
pm2 logs --err

# Specific process with timestamp
pm2 logs udemy-dl-workers --timestamp

# Raw format (no PM2 formatting)
pm2 logs --raw --lines 50
```

---

## 🧪 Test Queue Processing

```bash
# Add a test job to Redis
redis-cli LPUSH rq:queue:downloads '{"taskId":99999,"email":"test@example.com","courseUrl":"https://www.udemy.com/course/python-basics/"}'

# Watch worker logs
pm2 logs udemy-dl-workers --lines 0

# Check queue length
redis-cli LLEN rq:queue:downloads

# Monitor job processing
watch -n 2 'redis-cli LLEN rq:queue:downloads'
```

---

## 📊 Useful PM2 Commands Reference

```bash
# List all processes
pm2 list

# Describe specific process
pm2 describe backend

# Monitor all processes
pm2 monit

# Show process info
pm2 show backend

# Restart all
pm2 restart all

# Stop all
pm2 stop all

# Delete all
pm2 delete all

# Flush logs
pm2 flush

# Reload ecosystem (zero-downtime)
pm2 reload ecosystem.config.js

# Update PM2
npm install -g pm2@latest
pm2 update
```

---

## 🎯 Quick Health Check

```bash
# One-liner to check everything
echo "=== PM2 Status ===" && pm2 list && \
echo -e "\n=== Redis Status ===" && redis-cli ping && \
echo -e "\n=== Queue Length ===" && redis-cli LLEN rq:queue:downloads && \
echo -e "\n=== Backend Health ===" && curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 && \
echo -e "\n=== System Resources ===" && free -h && df -h /
```

---

**Last Updated**: 2026-01-12
