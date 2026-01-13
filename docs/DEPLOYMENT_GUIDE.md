# 🚀 Production Deployment Guide - KhoaHocGiaRe.info

## 📋 System Architecture

```
Internet Users
     ↓
Cloudflare CDN/Proxy (DNS: khoahocgiare.info)
     ↓
VPS Server (103.137.234.132)
     ↓
Nginx Reverse Proxy (Port 80/443)
     ├─→ Backend API (localhost:3000) → api.khoahocgiare.info
     └─→ Frontend Next.js (localhost:3001) → khoahocgiare.info
```

---

## 🔧 Pre-Deployment Checklist

### 1. Verify Applications are Running

```bash
# Check Backend (should return JSON or "OK")
curl http://localhost:3000/health

# Check Frontend (should return HTML)
curl http://localhost:3001

# If not running, start them:
cd /root/server
pm2 start server.js --name "backend"
pm2 start npm --name "frontend" -- start
pm2 save
```

### 2. Check Nginx Installation

```bash
nginx -v
# Expected: nginx version: nginx/1.18.0 (Ubuntu)
```

### 3. Verify DNS Configuration

```bash
# Check domain resolves to your IP
dig +short khoahocgiare.info
dig +short api.khoahocgiare.info
dig +short www.khoahocgiare.info

# All should return: 103.137.234.132 (or Cloudflare IPs if proxy enabled)
```

---

## 🚀 Deployment Steps

### Step 1: Make Deployment Script Executable

```bash
cd /root/server
chmod +x deploy-nginx.sh
```

### Step 2: Deploy Nginx Configuration

```bash
sudo bash deploy-nginx.sh
```

**What this script does:**
1. ✅ Backs up existing configuration
2. ✅ Installs new configuration
3. ✅ Tests configuration syntax
4. ✅ Reloads Nginx
5. ✅ Verifies Nginx is running

### Step 3: Verify Deployment

```bash
# Test API endpoint
curl -I http://api.khoahocgiare.info

# Test Frontend
curl -I http://khoahocgiare.info

# Test www redirect
curl -I http://www.khoahocgiare.info
```

Expected response headers:
```
HTTP/1.1 200 OK
Server: nginx
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
```

---

## 🔍 Testing & Verification

### 1. Test Backend API

```bash
# Health check
curl http://api.khoahocgiare.info/health

# Test API endpoint
curl http://api.khoahocgiare.info/api/courses
```

### 2. Test Frontend

```bash
# Check homepage loads
curl -L http://khoahocgiare.info | head -n 20

# Verify Next.js is serving
curl http://khoahocgiare.info/_next/static/
```

### 3. Test Real IP Forwarding

Check your backend logs to ensure it receives real client IP (not Cloudflare's):

```bash
# Watch backend logs
pm2 logs backend --lines 50

# Make a test request
curl http://api.khoahocgiare.info/health
```

Your backend should log the **real visitor IP**, not `173.x.x.x` (Cloudflare IPs).

### 4. Test Large File Upload

```bash
# Create a 40MB test file
dd if=/dev/zero of=/tmp/test.bin bs=1M count=40

# Test upload (replace with your actual upload endpoint)
curl -X POST -F "file=@/tmp/test.bin" http://api.khoahocgiare.info/api/upload

# Clean up
rm /tmp/test.bin
```

### 5. Monitor Nginx Logs

```bash
# Watch all logs in real-time
sudo tail -f /var/log/nginx/*.log

# API access log only
sudo tail -f /var/log/nginx/api.khoahocgiare.info.access.log

# Frontend error log
sudo tail -f /var/log/nginx/khoahocgiare.info.error.log
```

---

## 🔐 Cloudflare Configuration

### Current Setup (HTTP Only)

Since you're using Cloudflare as proxy:

1. **In Cloudflare Dashboard** → `SSL/TLS` → `Overview`:
   - Set to **"Flexible"** (for now, upgrade to "Full (Strict)" later)

2. **DNS Settings** (should already be configured):
   ```
   Type  | Name | Content            | Proxy Status
   ------|------|--------------------|--------------
   A     | @    | 103.137.234.132    | Proxied (🟠)
   A     | www  | 103.137.234.132    | Proxied (🟠)
   A     | api  | 103.137.234.132    | Proxied (🟠)
   ```

3. **Firewall Rules** (Optional - Rate Limiting):
   - Go to `Security` → `WAF` → `Rate Limiting Rules`
   - Create rule: "Limit API requests to 100 per minute per IP"

---

## 📊 Monitoring & Maintenance

### PM2 Process Monitoring

```bash
# Check all processes
pm2 status

# Monitor in real-time
pm2 monit

# Check logs
pm2 logs

# Restart if needed
pm2 restart backend
pm2 restart frontend
```

### Nginx Status

```bash
# Check if running
sudo systemctl status nginx

# Reload config (no downtime)
sudo systemctl reload nginx

# Restart (brief downtime)
sudo systemctl restart nginx

# Check active connections
sudo ss -tuln | grep ':80\|:443'
```

### Log Rotation

Nginx logs are automatically rotated by logrotate. Check config:

```bash
cat /etc/logrotate.d/nginx
```

To manually rotate:
```bash
sudo logrotate -f /etc/logrotate.d/nginx
```

---

## 🐛 Troubleshooting

### Issue 1: 502 Bad Gateway

**Cause:** Backend/Frontend not running

**Fix:**
```bash
# Check if apps are running
pm2 status

# Check if listening on correct ports
sudo ss -tuln | grep ':3000\|:3001'

# Restart apps
pm2 restart all
```

---

### Issue 2: 504 Gateway Timeout

**Cause:** Backend taking too long to respond (>300s)

**Fix:**
- Check backend logs: `pm2 logs backend`
- Increase timeout in nginx-config.conf if needed
- Optimize backend code

---

### Issue 3: Real IP not showing in backend

**Cause:** Cloudflare IPs not whitelisted

**Fix:**
- Verify Cloudflare IP ranges in nginx-config.conf are up-to-date
- Check backend is reading `X-Real-IP` or `CF-Connecting-IP` header

---

### Issue 4: WebSocket connection fails (Next.js HMR)

**Cause:** Upgrade header not properly forwarded

**Fix:**
- Verify nginx config has:
  ```nginx
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  ```
- Reload nginx: `sudo systemctl reload nginx`

---

### Issue 5: "413 Request Entity Too Large"

**Cause:** Upload size exceeds `client_max_body_size`

**Fix:**
- Already set to 50M for API, 10M for frontend
- If need more, edit `/etc/nginx/sites-available/khoahocgiare.info`
- Reload nginx: `sudo systemctl reload nginx`

---

## 🔄 Rollback Procedure

If something goes wrong:

```bash
# List backups
ls -lh /etc/nginx/sites-available/*.backup.*

# Restore previous config (replace YYYYMMDD_HHMMSS with actual timestamp)
sudo cp /etc/nginx/sites-available/default.backup.YYYYMMDD_HHMMSS \
       /etc/nginx/sites-available/khoahocgiare.info

# Test and reload
sudo nginx -t && sudo systemctl reload nginx
```

---

## 📈 Performance Optimization (Optional)

### Enable Gzip Compression

Add to `/etc/nginx/nginx.conf` in the `http` block:

```nginx
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_types text/plain text/css text/xml text/javascript 
           application/json application/javascript application/xml+rss 
           application/rss+xml font/truetype font/opentype 
           application/vnd.ms-fontobject image/svg+xml;
gzip_disable "msie6";
```

### Enable HTTP/2 (After SSL setup)

In your server blocks, change:
```nginx
listen 443 ssl;
# to
listen 443 ssl http2;
```

---

## 🎯 Next Steps

1. ✅ **Deploy Nginx** (you just did this!)
2. 🔐 **Setup SSL/HTTPS** → Follow `SSL_SETUP.md`
3. 📊 **Setup Monitoring** → Consider tools like:
   - Uptime monitoring: UptimeRobot, Pingdom
   - Error tracking: Sentry
   - Log aggregation: Logstash, Grafana Loki
4. 🔄 **Setup Automated Backups**
5. 🔐 **Harden Security** → Fail2ban, UFW rules
6. 📧 **Test Email Notifications** → Your new batch email system!

---

## 📞 Quick Commands Reference

```bash
# Nginx
sudo nginx -t                          # Test config
sudo systemctl reload nginx            # Reload (no downtime)
sudo systemctl restart nginx           # Restart
sudo systemctl status nginx            # Check status
sudo tail -f /var/log/nginx/error.log  # Watch error log

# PM2
pm2 status                             # List processes
pm2 logs                               # View logs
pm2 restart all                        # Restart all apps
pm2 monit                              # Real-time monitoring

# System
sudo ss -tuln | grep ':80\|:443'       # Check listening ports
htop                                   # System resources
df -h                                  # Disk space
free -h                                # Memory usage

# Cloudflare CLI (if installed)
cf-tool domain:info khoahocgiare.info  # Domain info
```

---

## 📚 Documentation Files

- `nginx-config.conf` → Production Nginx configuration
- `deploy-nginx.sh` → Automated deployment script
- `SSL_SETUP.md` → Complete SSL/HTTPS setup guide
- `DEPLOYMENT_GUIDE.md` → This file

---

## ✅ Deployment Checklist

- [x] Nginx configuration created
- [x] Deployment script ready
- [ ] Deploy Nginx configuration
- [ ] Verify API responds on http://api.khoahocgiare.info
- [ ] Verify Frontend responds on http://khoahocgiare.info
- [ ] Test real IP forwarding
- [ ] Check logs for errors
- [ ] Setup SSL (see SSL_SETUP.md)
- [ ] Configure Cloudflare security features
- [ ] Test batch email notifications
- [ ] Setup monitoring/alerting

---

**🎉 You're production-ready!**

For SSL setup (HTTPS), proceed to: **`SSL_SETUP.md`**
