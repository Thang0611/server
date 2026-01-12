# Queue Operations Guide - Redis Queue System (Phase 2)

> **For operators new to message queues**  
> This guide explains how our download system works and how to manage it.

---

## 📚 Table of Contents

1. [What is a Message Queue?](#what-is-a-message-queue)
2. [How Our System Works](#how-our-system-works)
3. [Why We Use Queues](#why-we-use-queues)
4. [Quick Command Cheat Sheet](#quick-command-cheat-sheet)
5. [Daily Operations](#daily-operations)
6. [Troubleshooting Guide](#troubleshooting-guide)
7. [Common Scenarios](#common-scenarios)

---

## 🎓 What is a Message Queue?

Think of a message queue like a **post office mailbox**:

- **Payment System (Node.js)** = Person who drops letters in the mailbox
- **Redis Queue** = The mailbox itself (stores letters safely)
- **Python Workers** = Mail carriers who pick up letters and deliver them

**Simple Analogy:**
```
Customer Pays
    ↓
Payment System puts "download request" in mailbox (Redis)
    ↓
Python Worker checks mailbox, finds request
    ↓
Worker downloads course and delivers it
```

---

## 🔄 How Our System Works

### Visual Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    PAYMENT WEBHOOK ARRIVES                       │
│  Customer transferred money, SePay notifies our server          │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────┐
         │   PAYMENT SERVICE       │
         │   (Node.js)             │
         │                         │
         │  1. Verify payment      │
         │  2. Update database:    │
         │     status='processing' │
         │  3. Push to Redis queue │
         └────────┬────────────────┘
                  │
                  │ addDownloadJob({
                  │   taskId: 123,
                  │   email: "user@example.com",
                  │   courseUrl: "https://..."
                  │ })
                  │
                  ▼
         ┌─────────────────────────┐
         │   REDIS QUEUE           │
         │   (Message Broker)      │
         │                         │
         │  Queue: rq:queue:       │
         │         downloads       │
         │                         │
         │  [Job 1] [Job 2] [Job 3]│
         └────────┬────────────────┘
                  │
                  │ Workers poll queue
                  │ (BRPOP - blocking pop)
                  │
         ┌────────┴────────────────────────────┐
         │                                     │
    ┌────▼────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
    │Worker #1│  │Worker #2│  │Worker #3│  │Worker #4│  │Worker #5│
    │ Python  │  │ Python  │  │ Python  │  │ Python  │  │ Python  │
    │         │  │         │  │         │  │         │  │         │
    │ [IDLE]  │  │[WORKING]│  │ [IDLE]  │  │ [IDLE]  │  │ [IDLE]  │
    └────┬────┘  └────┬────┘  └─────────┘  └─────────┘  └─────────┘
         │            │
         │            └─> Download course
         │                Upload to Google Drive
         │                Update database: status='completed'
         │                Send email notification
         │
         └─> Ready for next job
```

See full documentation at: /root/server/PHASE2_README.md


### Step-by-Step Process

1. **Customer Pays** → Payment gateway (SePay) sends webhook to our server
2. **Payment Verified** → Node.js checks payment amount and order code
3. **Database Updated** → Order status = 'paid', Tasks status = 'processing'
4. **Job Pushed to Queue** → Task details sent to Redis queue
5. **Worker Picks Up Job** → Python worker gets job from queue (instant, no delay)
6. **Download Starts** → Worker downloads course using Udemy credentials
7. **Upload to Drive** → Course uploaded to Google Drive via rclone
8. **Database Updated** → Task status = 'completed'
9. **Email Sent** → Customer receives download link
10. **Worker Ready** → Worker waits for next job

---

## ✨ Why We Use Queues (vs Old System)

### Performance Comparison

| Metric | Old (Polling) | New (Queue) | Improvement |
|--------|--------------|-------------|-------------|
| Processing Delay | 5-10 seconds | < 1 second | **10x faster** |
| DB Queries/Day | 8,640 | ~100 | **99% reduction** |
| Concurrent Downloads | 1 | 5 | **5x throughput** |
| CPU Usage | High (constant polling) | Low (event-driven) | **80% reduction** |
| Scalability | Hard (1 server) | Easy (N workers) | **Unlimited** |

**Benefits:**
- ✅ **Instant processing** - No waiting, no polling
- ✅ **Scalable** - 5 workers process 5 courses simultaneously
- ✅ **Reliable** - Jobs persist in Redis even if workers restart
- ✅ **Efficient** - ~99% fewer database queries
- ✅ **Observable** - Easy to monitor queue size and worker status

---

## 🎮 Quick Command Cheat Sheet

### Check System Health

```bash
# Check if Redis is running
redis-cli ping
# Expected: PONG

# Check if Python workers are running (should be 5)
ps aux | grep worker_rq.py | grep -v grep | wc -l

# Check worker service status
sudo systemctl status udemy-worker-rq

# Check how many jobs are waiting in queue
redis-cli LLEN rq:queue:downloads
# Expected: 0 or small number
```

### Monitor Workers

```bash
# View live logs from all workers
tail -f /root/server/logs/rq_worker_*.log

# View logs from specific worker
tail -f /root/server/logs/rq_worker_1.log

# See what each worker is doing
for i in {1..5}; do 
  echo "=== Worker $i ===" 
  tail -3 /root/server/logs/rq_worker_$i.log
done
```

### Restart Workers

```bash
# Restart using systemd (recommended)
sudo systemctl restart udemy-worker-rq

# Verify workers started
sleep 3
ps aux | grep worker_rq.py | grep -v grep | wc -l
# Expected: 5
```

---

## 🔧 Troubleshooting Guide

### Problem 1: "Customer paid but didn't receive course"

**Diagnosis Steps:**

1. **Check task status in database:**
```bash
mysql -u root -p -e "
SELECT id, course_url, status, updated_at
FROM download_tasks 
WHERE email = 'customer@email.com'
ORDER BY created_at DESC 
LIMIT 5;
"
```

2. **Interpret status codes:**

| Status | Meaning | Action Required |
|--------|---------|-----------------|
| `paid` | Not queued yet | Queue manually |
| `processing` | In queue or downloading | Check worker logs |
| `failed` | Download failed | Check logs, retry |
| `completed` | Done | Check email logs |

**Solution A: Manual Re-queue (if status = 'paid' or 'failed'):**

```bash
cd /root/server
node -e "
const { addDownloadJob } = require('./src/queues/download.queue');
addDownloadJob({
  taskId: TASK_ID_HERE,
  email: 'customer@email.com',
  courseUrl: 'COURSE_URL_HERE'
}).then(() => {
  console.log('✅ Task queued');
  process.exit(0);
});
"
```

**Solution B: Check worker logs for errors:**

```bash
# Find which worker processed this task
grep -r "Task ID: TASK_ID_HERE" /root/server/logs/rq_worker_*.log
```

---

### Problem 2: "Queue is backing up"

**Symptoms:** `redis-cli LLEN rq:queue:downloads` shows large number (>10)

**Diagnosis:**
```bash
# Check queue size
redis-cli LLEN rq:queue:downloads

# Check if workers are running
ps aux | grep worker_rq.py | grep -v grep | wc -l
# Expected: 5
```

**Solutions:**

**A. Workers stopped:**
```bash
sudo systemctl restart udemy-worker-rq
```

**B. Add more workers temporarily:**
```bash
cd /root/server/udemy_dl
for i in {6..10}; do
  nohup python3 worker_rq.py $i > /root/server/logs/rq_worker_$i.log 2>&1 &
done
```

---

### Problem 3: "Redis is down"

**Diagnosis:**
```bash
redis-cli ping
# If error, Redis is down
```

**Solution:**
```bash
sudo systemctl start redis
redis-cli ping  # Should return PONG

# If workers stopped, restart them
sudo systemctl restart udemy-worker-rq
```

---

## 🎯 Common Scenarios

### Scenario 1: Manual Queue Task

```bash
# Step 1: Get task details from database
mysql -u root -p -e "
SELECT id, email, course_url 
FROM download_tasks 
WHERE id = YOUR_TASK_ID;
"

# Step 2: Push to queue
cd /root/server
node -e "
const { addDownloadJob } = require('./src/queues/download.queue');
addDownloadJob({
  taskId: YOUR_TASK_ID,
  email: 'EMAIL_FROM_DB',
  courseUrl: 'URL_FROM_DB'
}).then(() => console.log('✅ Queued')).catch(err => console.error(err));
"

# Step 3: Monitor progress
tail -f /root/server/logs/rq_worker_*.log | grep "Task ID: YOUR_TASK_ID"
```

---

### Scenario 2: System Restart

```bash
# Step 1: Stop workers
sudo systemctl stop udemy-worker-rq

# Step 2: Check Redis
redis-cli ping
# If not PONG: sudo systemctl start redis

# Step 3: Start workers
sudo systemctl start udemy-worker-rq

# Step 4: Verify
ps aux | grep worker_rq.py | grep -v grep | wc -l  # Should be 5
redis-cli LLEN rq:queue:downloads  # Check queue
```

---

### Scenario 3: Scale Up for High Traffic

```bash
# Add 5 more workers (total 10)
cd /root/server/udemy_dl
for i in {6..10}; do
  nohup python3 worker_rq.py $i > /root/server/logs/rq_worker_$i.log 2>&1 &
done

# Verify
ps aux | grep worker_rq.py | grep -v grep | wc -l
```

---

## 📊 Monitoring Script

Create `/root/server/monitor.sh`:

```bash
#!/bin/bash
clear
echo "═══════════════════════════════════════"
echo "    QUEUE MONITORING DASHBOARD"
echo "═══════════════════════════════════════"
echo ""
echo "Redis:    $(redis-cli ping 2>/dev/null || echo 'DOWN')"
echo "Workers:  $(ps aux | grep worker_rq.py | grep -v grep | wc -l)/5"
echo "Queue:    $(redis-cli LLEN rq:queue:downloads) jobs waiting"
echo ""
echo "Last updated: $(date '+%H:%M:%S')"
```

**Usage:**
```bash
chmod +x /root/server/monitor.sh
watch -n 5 ./monitor.sh  # Auto-refresh every 5 seconds
```

---

## ✅ Daily Checklist

```
[ ] Redis running (redis-cli ping = PONG)
[ ] 5 workers running
[ ] Queue empty or small (<10 jobs)
[ ] No errors in logs
[ ] Disk space >20% free
```

---

## 📚 Additional Resources

- **Full Documentation:** `/root/server/PHASE2_README.md`
- **Deployment Guide:** `/root/server/PHASE2_DEPLOYMENT_GUIDE.md`
- **Quick Reference:** `/root/server/PHASE2_QUICK_REFERENCE.md`
- **Worker Code:** `/root/server/udemy_dl/worker_rq.py`
- **Queue Code:** `/root/server/src/queues/download.queue.js`

---

**Last Updated:** January 12, 2026  
**Version:** Phase 2 - Redis Queue System  
**For Support:** Check logs first, then escalate if needed
