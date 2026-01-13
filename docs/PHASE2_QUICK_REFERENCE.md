# Phase 2: Redis Queue - Quick Reference Card

## Quick Commands

### Start/Stop Workers

```bash
# Start workers manually
./start_workers.sh

# Stop workers manually
./stop_workers.sh

# Start workers with systemd (production)
sudo systemctl start udemy-worker-rq

# Stop workers with systemd
sudo systemctl stop udemy-worker-rq

# Restart workers
sudo systemctl restart udemy-worker-rq

# View status
sudo systemctl status udemy-worker-rq
```

### Monitor Queue

```bash
# Queue statistics
rq info --url redis://localhost:6379

# Watch queue in real-time
watch -n 1 'rq info --url redis://localhost:6379'

# View worker logs
tail -f /root/server/logs/rq_worker_*.log

# View all logs at once
tail -f /root/server/logs/rq_worker_*.log | grep -E "TASK|SUCCESS|FAILED"
```

### Redis Commands

```bash
# Check Redis is running
redis-cli ping

# View queue lengths
redis-cli LLEN bull:downloads:wait
redis-cli LLEN bull:downloads:active
redis-cli LLEN bull:downloads:completed
redis-cli LLEN bull:downloads:failed

# Monitor Redis in real-time
redis-cli MONITOR

# Clear all queues (DANGER - only for testing!)
redis-cli FLUSHALL
```

### Database Commands

```bash
# Check task statuses
mysql -u root -p -e "
SELECT 
  status, 
  COUNT(*) as count 
FROM download_tasks 
GROUP BY status;
"

# View recent tasks
mysql -u root -p -e "
SELECT 
  id, 
  email, 
  status, 
  created_at 
FROM download_tasks 
ORDER BY created_at DESC 
LIMIT 10;
"

# Check failed tasks
mysql -u root -p -e "
SELECT 
  id, 
  course_url, 
  status, 
  updated_at 
FROM download_tasks 
WHERE status='failed' 
ORDER BY updated_at DESC 
LIMIT 20;
"
```

## File Structure

```
/root/server/
├── src/
│   └── queues/
│       └── download.queue.js          # BullMQ queue setup (Node.js)
├── udemy_dl/
│   ├── worker.py                      # OLD: Polling-based worker
│   ├── worker_rq.py                   # NEW: RQ-based worker
│   └── requirements.txt               # Python dependencies
├── start_workers.sh                   # Start 5 RQ workers
├── stop_workers.sh                    # Stop all RQ workers
├── udemy-worker.service               # OLD: Systemd service
├── udemy-worker-rq.service            # NEW: Systemd service
├── logs/
│   ├── rq_worker_1.log               # Worker 1 logs
│   ├── rq_worker_2.log               # Worker 2 logs
│   └── ...                            # Worker 3-5 logs
└── PHASE2_DEPLOYMENT_GUIDE.md         # Full deployment guide
```

## Environment Variables

Required in `/root/server/.env`:

```bash
# Database
DB_HOST=localhost
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=your_database

# Udemy
UDEMY_TOKEN=your_token

# Redis (NEW in Phase 2)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=                        # Optional

# API Security
API_SECRET_KEY=your_secret_key
```

## Worker Configuration

Edit `/root/server/start_workers.sh`:

```bash
WORKER_COUNT=5                         # Number of parallel workers
QUEUE_NAME="downloads"                 # Redis queue name
REDIS_URL="redis://localhost:6379"    # Redis connection URL
```

## Job Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Payment Webhook                                          │
│    └─> src/services/payment.service.js                     │
│        └─> Update DB: status = 'processing'                │
│        └─> Push job to Redis queue (BullMQ)                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Redis Queue (bull:downloads)                             │
│    └─> Jobs waiting: { taskId, email, courseUrl }          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. RQ Workers (5 parallel processes)                        │
│    └─> udemy_dl/worker_rq.py                               │
│        └─> process_download(task_data)                     │
│            ├─> Download course (main.py)                   │
│            ├─> Upload to Google Drive (rclone)             │
│            ├─> Update DB: status = 'completed'             │
│            └─> Notify webhook for email                    │
└─────────────────────────────────────────────────────────────┘
```

## Task Status Flow

```
pending → enrolled → processing → downloading → completed
                  └──────────────────────────────┘
                                ├─> failed (if error)
                                └─> retry (if temporary failure)
```

## Common Issues & Solutions

| Issue | Quick Fix |
|-------|-----------|
| Jobs not processing | `sudo systemctl restart udemy-worker-rq` |
| Redis not running | `sudo systemctl start redis` |
| Workers crashed | Check logs: `tail -f /root/server/logs/rq_worker_*.log` |
| Queue backed up | Increase workers: edit `WORKER_COUNT` in `start_workers.sh` |
| Jobs stuck in 'active' | Restart workers to reset stuck jobs |

## Performance Monitoring

```bash
# Watch queue size in real-time
watch -n 2 'echo "Waiting: $(redis-cli LLEN bull:downloads:wait)"; echo "Active: $(redis-cli LLEN bull:downloads:active)"; echo "Completed: $(redis-cli LLEN bull:downloads:completed)"; echo "Failed: $(redis-cli LLEN bull:downloads:failed)"'

# Monitor worker CPU/Memory
htop -p $(pgrep -f "rq worker" | tr '\n' ',')

# Check system resources
free -h
df -h
```

## Testing

### Test Job Creation (Node.js)

```javascript
const { addDownloadJob } = require('./src/queues/download.queue');

addDownloadJob({
  taskId: 999,
  email: 'test@example.com',
  courseUrl: 'https://samsung.udemy.com/course/test'
});
```

### Test Job Processing (Python)

```bash
cd /root/server/udemy_dl
python3 -c "from worker_rq import process_download; process_download({'taskId': 999, 'email': 'test@example.com', 'courseUrl': 'https://samsung.udemy.com/course/test'})"
```

### Test End-to-End Flow

```bash
# 1. Create order
curl -X POST https://api.khoahocgiare.info/api/v1/payment/create-order \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "courses": [{"url": "https://samsung.udemy.com/course/test"}]}'

# 2. Trigger payment webhook
curl -X POST https://api.khoahocgiare.info/api/v1/webhook/sepay \
  -H "Content-Type: application/json" \
  -d '{"orderCode": "DH000123", "transferAmount": 2000}'

# 3. Watch progress
tail -f /root/server/logs/rq_worker_1.log
```

## Emergency Commands

```bash
# Kill all workers immediately (emergency only)
pkill -9 -f "rq worker"

# Clear all Redis data (DANGER!)
redis-cli FLUSHALL

# Reset stuck tasks in database
mysql -u root -p -e "UPDATE download_tasks SET status='enrolled' WHERE status='processing'"

# Restart entire system
sudo systemctl restart redis
sudo systemctl restart udemy-worker-rq
sudo systemctl restart your-node-app
```

## Health Check

Run this to check system health:

```bash
#!/bin/bash
echo "=== HEALTH CHECK ==="
echo ""
echo "1. Redis Status:"
systemctl is-active redis && echo "✅ Redis running" || echo "❌ Redis down"
echo ""
echo "2. Workers Status:"
systemctl is-active udemy-worker-rq && echo "✅ Workers running" || echo "❌ Workers down"
echo ""
echo "3. Worker Processes:"
pgrep -f "rq worker" | wc -l | xargs echo "  Active workers:"
echo ""
echo "4. Queue Stats:"
echo "  Waiting: $(redis-cli LLEN bull:downloads:wait 2>/dev/null || echo 'N/A')"
echo "  Active: $(redis-cli LLEN bull:downloads:active 2>/dev/null || echo 'N/A')"
echo "  Failed: $(redis-cli LLEN bull:downloads:failed 2>/dev/null || echo 'N/A')"
echo ""
echo "5. Database Tasks:"
mysql -u root -p -N -e "SELECT CONCAT(status, ': ', COUNT(*)) FROM download_tasks GROUP BY status" 2>/dev/null || echo "  Cannot connect to DB"
echo ""
echo "=== END HEALTH CHECK ==="
```

Save as `health_check.sh`, make executable, and run:

```bash
chmod +x health_check.sh
./health_check.sh
```

## Useful Aliases

Add to `~/.bashrc`:

```bash
alias rq-status='rq info --url redis://localhost:6379'
alias rq-logs='tail -f /root/server/logs/rq_worker_*.log'
alias rq-restart='sudo systemctl restart udemy-worker-rq'
alias rq-queue='redis-cli LLEN bull:downloads:wait'
```

Then: `source ~/.bashrc`
