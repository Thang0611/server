# PM2 Quick Reference Card

## 🚀 Essential Commands

```bash
# Start ecosystem
pm2 start ecosystem.config.js

# Stop all
pm2 stop all

# Restart all
pm2 restart all

# View status
pm2 list

# View logs (all)
pm2 logs

# View logs (specific)
pm2 logs backend

# Monitor dashboard
pm2 monit

# Save configuration
pm2 save
```

---

## 📝 Log Commands

```bash
pm2 logs                      # All logs (tail -f)
pm2 logs backend              # Specific app logs
pm2 logs --lines 100          # Last 100 lines
pm2 logs --err                # Errors only
pm2 logs --raw                # Raw format
pm2 flush                     # Clear all logs
```

---

## 🔄 Restart Commands

```bash
pm2 restart backend           # Restart specific app
pm2 restart all               # Restart all apps
pm2 reload backend            # Zero-downtime restart (cluster mode)
pm2 restart ecosystem.config.js  # Restart entire ecosystem
```

---

## 🛑 Stop/Start Commands

```bash
pm2 stop backend              # Stop specific app
pm2 stop all                  # Stop all apps
pm2 start backend             # Start specific app
pm2 delete backend            # Remove from PM2 list
pm2 delete all                # Remove all from PM2
```

---

## 📊 Monitoring Commands

```bash
pm2 monit                     # Real-time dashboard
pm2 status                    # Process status
pm2 list                      # List all processes
pm2 describe backend          # Detailed app info
pm2 show backend              # Show all info about app
```

---

## 🔍 Redis Queue Commands

```bash
redis-cli ping                           # Test connection
redis-cli LLEN rq:queue:downloads        # Queue length
redis-cli LRANGE rq:queue:downloads 0 5  # View first 5 jobs
redis-cli DEL rq:queue:downloads         # Clear queue (emergency)
```

---

## 🐛 Troubleshooting

```bash
# Worker not processing
pm2 restart udemy-dl-workers
pm2 logs udemy-dl-workers --lines 50

# Backend errors
pm2 logs backend --err --lines 100
pm2 restart backend

# Check if port is in use
netstat -tulpn | grep 3000

# Kill zombie processes
pkill -9 -f worker_rq.py
```

---

## 🔧 Configuration

```bash
# Edit ecosystem config
nano ecosystem.config.js

# Reload after config change
pm2 restart ecosystem.config.js

# Save changes
pm2 save

# Setup auto-start on boot
pm2 startup
pm2 save
```

---

## 📈 Scaling

```bash
# Scale to N instances
pm2 scale backend 4

# Scale up by 2
pm2 scale backend +2

# Scale down by 1
pm2 scale backend -1
```

---

## 🆘 Emergency Commands

```bash
# Kill PM2 daemon (nuclear option)
pm2 kill

# Restart PM2 from scratch
pm2 kill && pm2 start ecosystem.config.js

# Stop everything
pm2 stop all && pm2 delete all
```

---

## ✅ Health Checks

```bash
# Quick status
pm2 list

# Verify Redis
redis-cli ping

# Check queue
redis-cli LLEN rq:queue:downloads

# Test backend
curl http://localhost:3000

# System resources
free -h
df -h
```

---

## 📂 File Locations

```
/root/server/
├── ecosystem.config.js          # PM2 configuration
├── logs/
│   ├── backend-out.log          # Backend stdout
│   ├── backend-error.log        # Backend errors
│   ├── worker-out.log           # Worker stdout
│   ├── worker-error.log         # Worker errors
│   ├── nextjs-out.log           # Next.js stdout
│   └── nextjs-error.log         # Next.js errors
├── udemy_dl/
│   └── worker_rq.py             # Worker script
└── server.js                    # Backend entry point
```

---

## 🔗 Useful Links

- **PM2 Docs**: https://pm2.keymetrics.io/docs/
- **Ecosystem**: https://pm2.keymetrics.io/docs/usage/application-declaration/
- **Redis Commands**: https://redis.io/commands/

---

**Print this and keep it handy!** 📌
