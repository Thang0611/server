# Fix: Next.js PM2 Unstable Restarts

**Ngày:** 2026-01-13  
**Vấn đề:** Next.js app bị crash liên tục với PM2, dẫn đến "too many unstable restarts"  
**Root cause:** Port conflict - Dev server đang chạy trên port 4000

---

## 🔍 Triệu chứng

```
PM2 | App [client-nextjs:1] exited with code [1] via signal [SIGINT]
PM2 | Script /root/.nvm/versions/node/v24.12.0/bin/npm had too many unstable restarts (16). Stopped. "errored"
```

**PM2 Status:**
- Status: `errored`
- Restarts: 207+ times
- All services stopped

---

## 🕵️ Phân tích nguyên nhân

### 1. Kiểm tra logs

```bash
pm2 logs client-nextjs --lines 50
```

**Kết quả:**
```
⨯ Failed to start server
⨯ Failed to start server
...
```

Không có error message chi tiết → cần test manual.

### 2. Test manual start

```bash
cd /root/clone-app
npm run start
```

**Error:**
```
Error: listen EADDRINUSE: address already in use :::4000
```

### 3. Tìm process chiếm port

```bash
lsof -i :4000
netstat -tulnp | grep :4000
ps aux | grep next
```

**Phát hiện:**
```
root  332366  sh -c next dev -p 4000
root  332367  node /root/clone-app/node_modules/.bin/next dev -p 4000
root  332378  next-server (v16.1.1)  ← DEV SERVER đang chạy
```

### ❌ Root Cause

**Next.js DEV server** đang chạy trên port 4000, khi PM2 cố start **production server** cũng trên port 4000 → **Port conflict** → Crash loop

---

## ✅ Giải pháp

### Bước 1: Dừng tất cả PM2 processes

```bash
pm2 delete all
```

### Bước 2: Kill Next.js dev server

```bash
# Find processes
ps aux | grep next

# Kill dev processes
kill -9 332366 332367 332378 332425

# Verify port is free
lsof -i :4000
# Output: Port 4000 is free ✅
```

### Bước 3: Start Next.js production với PM2

```bash
cd /root/clone-app
pm2 start ecosystem.config.js
```

**Ecosystem config:**
```javascript
module.exports = {
  apps: [
    {
      name: 'client-nextjs',
      script: './node_modules/next/dist/bin/next',
      args: 'start',
      interpreter: '/root/.nvm/versions/node/v24.12.0/bin/node',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};
```

### Bước 4: Start backend và workers

```bash
# Start backend (2 instances)
cd /root/server
pm2 start index.js --name backend -i 2

# Start Python workers (5 instances)
cd /root/server/udemy_dl
pm2 start worker_rq.py --name worker --interpreter python3 -i 5
```

### Bước 5: Save PM2 configuration

```bash
pm2 save
```

---

## 🎯 Kết quả

### PM2 Status sau fix

```
┌────┬──────────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┐
│ id │ name             │ mode    │ pid     │ uptime   │ ↺     │ status    │
├────┼──────────────────┼─────────┼─────────┼──────────┼────────┼───────────┤
│ 0  │ client-nextjs    │ cluster │ 386651  │ 63s      │ 0     │ ✅ online │
│ 1  │ backend          │ cluster │ 386891  │ 42s      │ 0     │ ✅ online │
│ 2  │ backend          │ cluster │ 386898  │ 42s      │ 0     │ ✅ online │
│ 3  │ worker           │ fork    │ 386974  │ 31s      │ 0     │ ✅ online │
│ 4  │ worker           │ fork    │ 386975  │ 31s      │ 0     │ ✅ online │
│ 5  │ worker           │ fork    │ 386976  │ 31s      │ 0     │ ✅ online │
│ 6  │ worker           │ fork    │ 386977  │ 31s      │ 0     │ ✅ online │
│ 7  │ worker           │ fork    │ 386978  │ 31s      │ 0     │ ✅ online │
└────┴──────────────────┴─────────┴─────────┴──────────┴────────┴───────────┘
```

### Verify Next.js

```bash
curl -I http://localhost:4000
# HTTP/1.1 200 OK ✅
```

```bash
pm2 logs client-nextjs --lines 5
# ▲ Next.js 16.1.1
# - Local:         http://localhost:4000
# - Network:       http://103.178.234.132:4000
# ✓ Ready in 804ms ✅
```

---

## 🔧 Commands reference

### Kiểm tra PM2 status
```bash
pm2 list
pm2 describe client-nextjs
pm2 logs client-nextjs --lines 50
```

### Restart services
```bash
pm2 restart all
pm2 restart client-nextjs
pm2 restart backend
pm2 restart worker
```

### Kiểm tra port conflicts
```bash
lsof -i :4000
netstat -tulnp | grep :4000
ps aux | grep next
```

### Kill process by port
```bash
lsof -ti:4000 | xargs kill -9
```

### Save/Load PM2 config
```bash
pm2 save                 # Save current process list
pm2 resurrect            # Load saved processes
pm2 startup              # Enable PM2 on boot
```

---

## 🚨 Phòng tránh vấn đề tương tự

### 1. Không chạy dev và production cùng lúc

```bash
# ❌ WRONG: Dev server on port 4000
npm run dev

# ✅ CORRECT: Only run production with PM2
pm2 start ecosystem.config.js
```

### 2. Kiểm tra port trước khi start

```bash
# Check if port is in use
lsof -i :4000 || echo "Port is free"

# If busy, kill it
lsof -ti:4000 | xargs kill -9
```

### 3. Sử dụng ecosystem config

Luôn dùng `ecosystem.config.js` thay vì command line để:
- Đảm bảo config nhất quán
- Dễ dàng replicate trên nhiều servers
- Tự động load khi `pm2 resurrect`

### 4. Monitor PM2 logs

```bash
# Real-time monitoring
pm2 monit

# Check logs regularly
pm2 logs --lines 100
```

---

## 📝 Notes

### Dev vs Production

**Development mode** (`npm run dev`):
- Hot reload
- Source maps
- Debug mode
- Port: 4000 (configurable)
- **Không nên dùng với PM2**

**Production mode** (`npm run start`):
- Optimized build
- No hot reload
- Better performance
- Port: 4000 (from .env or args)
- **Nên dùng với PM2**

### PM2 Best Practices

1. **Always use ecosystem config** cho Next.js apps
2. **Set max_memory_restart** để tránh memory leaks
3. **Use cluster mode** cho backend API (2+ instances)
4. **Use fork mode** cho Python workers
5. **Run `pm2 save`** sau mỗi thay đổi config
6. **Setup `pm2 startup`** để auto-start on boot

---

## 🎉 Summary

**Vấn đề:** Port conflict giữa Next.js dev server và production server

**Fix:**
1. ✅ Kill dev server
2. ✅ Start production với PM2 ecosystem config
3. ✅ Verify all services running
4. ✅ Save PM2 configuration

**Kết quả:**
- ✅ Next.js: 200 OK, ready in 804ms
- ✅ Backend: 2 instances online
- ✅ Workers: 5 instances online
- ✅ 0 restarts, stable uptime

---

**Status:** ✅ Fixed and verified  
**Impact:** High - Tất cả services đang chạy ổn định  
**Prevention:** Không chạy dev server khi production đang active
