# PM2 Ecosystem Configuration Guide

## 📋 Overview

This production environment uses **PM2 Ecosystem** mode to manage all services centrally:

- **Backend API** (Node.js) - 2 instances in cluster mode
- **Next.js Frontend** - 1 instance
- **Python Redis Workers** - 5 parallel download workers

All services are configured in `ecosystem.config.js` for unified management.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     PM2 Process Manager                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Backend    │  │   Backend    │  │    Next.js   │      │
│  │  (Node.js)   │  │  (Node.js)   │  │  (Frontend)  │      │
│  │   Port 3000  │  │   Port 3000  │  │   Port 3001  │      │
│  │  Instance #0 │  │  Instance #1 │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Worker #1  │  │   Worker #2  │  │   Worker #3  │      │
│  │  (Python3)   │  │  (Python3)   │  │  (Python3)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │   Worker #4  │  │   Worker #5  │                         │
│  │  (Python3)   │  │  (Python3)   │                         │
│  └──────────────┘  └──────────────┘                         │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  Redis Queue  │
                    │ rq:queue:downloads │
                    └───────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  MySQL DB     │
                    │ download_tasks│
                    └───────────────┘
```

---

## 🚀 Migration Instructions

### Prerequisites

1. Stop all current processes
2. Backup your data if needed
3. Ensure Redis is running: `redis-cli ping`
4. Ensure MySQL is accessible

### Step-by-Step Migration

#### 1. Run the Migration Script

```bash
cd /root/server
./migrate_to_pm2_ecosystem.sh
```

This script will automatically:
- ✅ Stop and disable the systemd service (`udemy-worker-rq`)
- ✅ Kill any lingering Python worker processes
- ✅ Remove old PM2 processes (`udemy-worker`)
- ✅ Start the new ecosystem
- ✅ Save PM2 configuration for auto-restart
- ✅ Setup PM2 startup script

#### 2. Verify Everything is Running

```bash
./verify_ecosystem.sh
```

Or manually check:

```bash
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

## 📖 Daily Operations

### View All Processes

```bash
pm2 list
```

### View Real-Time Logs

```bash
# All processes
pm2 logs

# Specific process
pm2 logs backend
pm2 logs udemy-dl-workers
pm2 logs client-nextjs

# Last 100 lines
pm2 logs --lines 100

# Follow logs in real-time
pm2 logs --raw --lines 0
```

### Monitor System

```bash
# Interactive dashboard
pm2 monit

# Memory and CPU usage
pm2 status
```

### Restart Services

```bash
# Restart all
pm2 restart ecosystem.config.js

# Restart specific service
pm2 restart backend
pm2 restart udemy-dl-workers

# Graceful reload (zero-downtime for backend)
pm2 reload backend
```

### Stop Services

```bash
# Stop all
pm2 stop ecosystem.config.js

# Stop specific
pm2 stop backend
pm2 stop udemy-dl-workers
```

### Start Services

```bash
# Start all
pm2 start ecosystem.config.js

# Start specific (after stop)
pm2 start backend
pm2 start udemy-dl-workers
```

### Delete Processes

```bash
# Remove all from PM2 list
pm2 delete all

# Remove specific
pm2 delete backend
```

---

## 🔧 Troubleshooting

### Workers Not Processing Jobs

1. Check if workers are running:
   ```bash
   pm2 list | grep udemy-dl-workers
   ```

2. Check Redis connection:
   ```bash
   redis-cli ping
   redis-cli LLEN rq:queue:downloads
   ```

3. Check worker logs:
   ```bash
   pm2 logs udemy-dl-workers --lines 50
   ```

4. Restart workers:
   ```bash
   pm2 restart udemy-dl-workers
   ```

### Backend Not Responding

1. Check backend status:
   ```bash
   pm2 logs backend --lines 50
   ```

2. Check if port is listening:
   ```bash
   netstat -tulpn | grep 3000
   ```

3. Restart backend:
   ```bash
   pm2 restart backend
   ```

### Process Keeps Restarting

1. Check error logs:
   ```bash
   pm2 logs <process-name> --err --lines 100
   ```

2. Check memory usage:
   ```bash
   pm2 list
   ```

3. If OOM (Out of Memory), increase limit in `ecosystem.config.js`:
   ```javascript
   max_memory_restart: '2G'  // Increase this value
   ```

### Environment Variables Not Loaded

1. Verify `.env` file exists in `/root/server/`
2. Check if `env_file` is correctly set in `ecosystem.config.js`
3. Restart the process:
   ```bash
   pm2 restart ecosystem.config.js
   ```

---

## 🔄 Rollback to Systemd

If you encounter issues and need to rollback:

```bash
cd /root/server
./rollback_ecosystem.sh
```

This will:
- Stop all PM2 processes
- Re-enable and start the systemd service
- Restore the previous setup

---

## 📊 Monitoring Redis Queue

### Check Queue Length

```bash
redis-cli LLEN rq:queue:downloads
```

### View Queue Contents (without removing)

```bash
redis-cli LRANGE rq:queue:downloads 0 -1
```

### Add Test Job to Queue

```bash
redis-cli LPUSH rq:queue:downloads '{"taskId":999,"email":"test@example.com","courseUrl":"https://www.udemy.com/course/test-course/"}'
```

### Clear Queue (Emergency)

```bash
redis-cli DEL rq:queue:downloads
```

---

## 📝 Log Files Location

All logs are stored in `/root/server/logs/`:

- `backend-out.log` - Backend stdout
- `backend-error.log` - Backend errors
- `worker-out.log` - Workers stdout (all 5 workers merged)
- `worker-error.log` - Workers errors
- `nextjs-out.log` - Next.js stdout
- `nextjs-error.log` - Next.js errors

### Rotate Logs

PM2 can automatically rotate logs. Install the module:

```bash
pm2 install pm2-logrotate
```

Configure rotation:

```bash
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
```

---

## 🔐 Security Considerations

1. **Environment Variables**: Ensure `.env` is NOT committed to git
2. **Redis Security**: Set password in `REDIS_PASSWORD` env var
3. **API Secret**: Strong `API_SECRET_KEY` in `.env`
4. **File Permissions**: 
   ```bash
   chmod 600 .env
   chmod 700 migrate_to_pm2_ecosystem.sh
   ```

---

## 🎯 Performance Tuning

### Backend (Node.js)

- **Increase instances**: Change `instances: 2` to `instances: 'max'` for all CPU cores
- **Memory limit**: Adjust `max_memory_restart: '500M'` based on actual usage

### Workers (Python)

- **Scale workers**: Change `instances: 5` to more workers (e.g., 10)
- **Memory limit**: Increase `max_memory_restart: '2G'` for large courses
- **Download concurrency**: Edit `worker_rq.py` line 227:
  ```python
  "--concurrent-downloads", "10",  # Increase for faster downloads
  ```

### Redis

- **Increase max memory**:
  ```bash
  redis-cli CONFIG SET maxmemory 1gb
  redis-cli CONFIG SET maxmemory-policy allkeys-lru
  ```

---

## 🆘 Emergency Commands

### Stop Everything Immediately

```bash
pm2 kill
```

### Restart Everything (Force)

```bash
pm2 kill && pm2 start ecosystem.config.js
```

### Check System Resources

```bash
# CPU and Memory
free -h
top -bn1 | head -20

# Disk usage
df -h
du -sh /root/server/*

# Network
netstat -tulpn | grep LISTEN
```

### Kill Zombie Processes

```bash
# Python workers
pkill -9 -f worker_rq.py

# Node.js
pkill -9 node
```

---

## 📚 Additional Resources

- **PM2 Documentation**: https://pm2.keymetrics.io/docs/usage/quick-start/
- **PM2 Ecosystem**: https://pm2.keymetrics.io/docs/usage/application-declaration/
- **Redis Commands**: https://redis.io/commands

---

## ✅ Post-Migration Checklist

- [ ] All processes show "online" status
- [ ] Backend responds at `http://localhost:3000`
- [ ] Next.js responds at `http://localhost:3001`
- [ ] Workers are connected to Redis
- [ ] Test job processes successfully
- [ ] Logs are being written
- [ ] PM2 startup script is configured
- [ ] Systemd service is disabled

---

## 🤝 Support

If you encounter issues:

1. Check logs: `pm2 logs --lines 100`
2. Run verification: `./verify_ecosystem.sh`
3. Check Redis: `redis-cli ping`
4. Check MySQL: `mysql -u <user> -p -h localhost -e "SELECT 1"`

---

**Last Updated**: 2026-01-12
**Version**: 1.0.0
