# Phase 2: Message Queue Migration - Deployment Guide

## Overview

Phase 2 replaces the MySQL polling mechanism with a Redis-based message queue system for improved scalability and performance.

**Architecture:**
- **Node.js (Producer)**: Uses BullMQ to push download jobs to Redis
- **Python (Consumer)**: Uses RQ (Redis Queue) to consume and process jobs
- **Redis**: Central message broker for job queue
- **MySQL**: Still used for persistent task status (for frontend tracking)

## Prerequisites

1. **Redis Server** must be installed and running
2. **Node.js** dependencies installed
3. **Python** dependencies installed
4. **.env** file configured with Redis credentials

## Installation Steps

### 1. Install Redis Server

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install redis-server -y

# Start Redis
sudo systemctl start redis
sudo systemctl enable redis

# Verify Redis is running
redis-cli ping
# Should return: PONG
```

### 2. Update Environment Variables

Add the following to `/root/server/.env`:

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=          # Leave empty if no password set
```

### 3. Install Node.js Dependencies

```bash
cd /root/server
npm install bullmq redis
```

### 4. Install Python Dependencies

```bash
cd /root/server/udemy_dl
pip3 install rq redis mysql-connector-python
```

Or install from requirements.txt:

```bash
pip3 install -r requirements.txt
```

### 5. Test the Queue System

#### Test BullMQ (Node.js side):

```bash
cd /root/server
node -e "
const { addDownloadJob } = require('./src/queues/download.queue');
addDownloadJob({
  taskId: 999,
  email: 'test@example.com',
  courseUrl: 'https://samsung.udemy.com/course/test'
}).then(() => {
  console.log('Job added successfully');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
"
```

#### Check Redis Queue:

```bash
# Connect to Redis CLI
redis-cli

# List all keys
KEYS *

# Check queue length
LLEN bull:downloads:wait

# View job data
HGETALL bull:downloads:999

# Exit Redis CLI
exit
```

### 6. Start RQ Workers

#### Manual Start (for testing):

```bash
cd /root/server
./start_workers.sh
```

This will start 5 parallel Python workers.

#### Check Worker Status:

```bash
# View worker logs
tail -f /root/server/logs/rq_worker_*.log

# Check RQ info
rq info --url redis://localhost:6379
```

#### Stop Workers:

```bash
./stop_workers.sh
```

### 7. Production Deployment with Systemd

#### Stop Old Worker Service:

```bash
# Stop the old polling-based worker
sudo systemctl stop udemy-worker
sudo systemctl disable udemy-worker
```

#### Install New RQ Worker Service:

```bash
# Copy service file
sudo cp /root/server/udemy-worker-rq.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start the service
sudo systemctl enable udemy-worker-rq
sudo systemctl start udemy-worker-rq

# Check status
sudo systemctl status udemy-worker-rq
```

#### View Logs:

```bash
# Service logs
sudo journalctl -u udemy-worker-rq -f

# Individual worker logs
tail -f /root/server/logs/rq_worker_*.log

# Application logs
tail -f /var/log/udemy-worker-rq.log
```

## Monitoring & Management

### Monitor Queue Statistics

```bash
# Using RQ CLI
rq info --url redis://localhost:6379

# Expected output:
# downloads      |███████ 5 workers, 3 jobs, 0 failed, 0 pending
```

### Monitor Redis Directly

```bash
redis-cli

# Queue stats
LLEN bull:downloads:wait      # Jobs waiting
LLEN bull:downloads:active    # Jobs processing
LLEN bull:downloads:completed # Completed jobs
LLEN bull:downloads:failed    # Failed jobs

# Monitor in real-time
MONITOR
```

### Restart Workers

```bash
sudo systemctl restart udemy-worker-rq
```

### Scale Workers

Edit `/root/server/start_workers.sh` and change `WORKER_COUNT`:

```bash
WORKER_COUNT=10  # Change from 5 to 10
```

Then restart:

```bash
sudo systemctl restart udemy-worker-rq
```

## Testing the Complete Flow

### 1. Create a Test Order

```bash
curl -X POST https://api.khoahocgiare.info/api/v1/payment/create-order \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "courses": [
      {
        "url": "https://samsung.udemy.com/course/test-course",
        "title": "Test Course"
      }
    ]
  }'
```

### 2. Simulate Payment Webhook

```bash
curl -X POST https://api.khoahocgiare.info/api/v1/webhook/sepay \
  -H "Content-Type: application/json" \
  -d '{
    "orderCode": "DH000123",
    "transferAmount": 2000,
    "gateway": "MB Bank",
    "transactionDate": "2026-01-12 10:30:00"
  }'
```

### 3. Monitor Job Processing

```bash
# Watch Redis queue
watch -n 1 'redis-cli LLEN bull:downloads:wait'

# Watch worker logs
tail -f /root/server/logs/rq_worker_*.log

# Check MySQL status
mysql -u root -p -e "SELECT id, course_url, status FROM download_tasks ORDER BY created_at DESC LIMIT 10;"
```

## Troubleshooting

### Problem: Jobs not being added to queue

**Check:**
1. Redis is running: `sudo systemctl status redis`
2. Node.js can connect to Redis: `redis-cli ping`
3. Environment variables are set correctly in `.env`
4. Check Node.js logs: `pm2 logs` or `tail -f /var/log/your-app.log`

### Problem: Workers not processing jobs

**Check:**
1. Workers are running: `ps aux | grep "rq worker"`
2. Check worker logs: `tail -f /root/server/logs/rq_worker_*.log`
3. Check RQ info: `rq info --url redis://localhost:6379`
4. Verify Redis connection in Python:
   ```bash
   python3 -c "import redis; r = redis.Redis(host='localhost', port=6379); print(r.ping())"
   ```

### Problem: Jobs stuck in 'active' state

**Cause:** Worker crashed while processing

**Solution:**
```bash
# Restart workers
sudo systemctl restart udemy-worker-rq

# Or manually clear stuck jobs (if necessary)
redis-cli
LRANGE bull:downloads:active 0 -1
# Remove stuck jobs if needed
```

### Problem: MySQL status not updating

**Check:**
1. Database credentials in `.env`
2. Worker can connect to MySQL:
   ```bash
   python3 -c "import mysql.connector; import os; from dotenv import load_dotenv; load_dotenv(); conn = mysql.connector.connect(user=os.getenv('DB_USER'), password=os.getenv('DB_PASSWORD'), host=os.getenv('DB_HOST'), database=os.getenv('DB_NAME')); print('Connected:', conn.is_connected())"
   ```

## Performance Tuning

### Increase Worker Count

For high-volume processing, increase workers:

```bash
# Edit start_workers.sh
vim /root/server/start_workers.sh

# Change WORKER_COUNT from 5 to desired number
WORKER_COUNT=10

# Restart service
sudo systemctl restart udemy-worker-rq
```

### Configure Redis for Production

Edit `/etc/redis/redis.conf`:

```conf
# Increase max memory
maxmemory 2gb
maxmemory-policy allkeys-lru

# Enable persistence
save 900 1
save 300 10
save 60 10000

# Optimize for performance
tcp-backlog 511
timeout 300
```

Restart Redis:
```bash
sudo systemctl restart redis
```

### Optimize BullMQ Settings

Edit `/root/server/src/queues/download.queue.js`:

```javascript
defaultJobOptions: {
  attempts: 5,           // Increase retry attempts
  backoff: {
    type: 'exponential',
    delay: 120000,       // Increase delay between retries
  },
  removeOnComplete: {
    count: 1000,         // Keep more completed jobs
    age: 48 * 3600,      // Keep for 48 hours
  }
}
```

## Rollback Plan

If you need to rollback to the old MySQL polling system:

```bash
# Stop RQ workers
sudo systemctl stop udemy-worker-rq
sudo systemctl disable udemy-worker-rq

# Start old worker
sudo systemctl enable udemy-worker
sudo systemctl start udemy-worker
```

## Architecture Comparison

### Phase 1 (MySQL Polling):
```
Payment Webhook → Update DB to 'processing' → Python polls DB every 10s → Process download
```

**Issues:**
- Constant database polling (high DB load)
- No concurrency control
- Wasted CPU cycles checking empty queue
- Hard to scale

### Phase 2 (Redis Queue):
```
Payment Webhook → Push job to Redis → RQ workers consume jobs → Process download
```

**Benefits:**
- ✅ Event-driven (no polling)
- ✅ Built-in concurrency with multiple workers
- ✅ Better scalability
- ✅ Job persistence and retries
- ✅ Monitoring and observability

## Next Steps

After Phase 2 is stable:

1. **Phase 3**: Implement WebSocket notifications for real-time frontend updates
2. **Phase 4**: Add job priority queues (VIP customers first)
3. **Phase 5**: Implement distributed workers across multiple servers
4. **Phase 6**: Add scheduled jobs for maintenance tasks

## Support

For issues or questions:
- Check logs: `/root/server/logs/rq_worker_*.log`
- Check Redis: `redis-cli MONITOR`
- Check database: `SELECT * FROM download_tasks WHERE status='failed'`
