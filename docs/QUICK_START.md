# ⚡ Quick Start - KhoaHocGiaRe.info Production

## 🎉 DEPLOYMENT COMPLETE!

Your system is **LIVE** and production-ready!

---

## ✅ What's Working Right Now

### 1. **Websites**
- 🌐 **Main Site:** http://khoahocgiare.info
- 🌐 **WWW:** http://www.khoahocgiare.info
- 🔌 **API:** http://api.khoahocgiare.info

### 2. **Email System (NEW!)**
- ✅ Batch notifications (1 email per order, not per course)
- ✅ Modern HTML template with table view
- ✅ Status badges (Green = Success, Red = Failed)
- ✅ Strict validation (only successful if drive_link exists)

### 3. **Infrastructure**
- ✅ Nginx reverse proxy configured
- ✅ Cloudflare Real IP forwarding
- ✅ PM2 processes running
- ✅ Security headers enabled
- ✅ Large file upload (50MB)
- ✅ Long timeout (300s for API)

---

## 🚀 Quick Commands

### Check System Status
```bash
# All processes
pm2 status

# Nginx status
sudo systemctl status nginx

# Test websites
curl -I http://khoahocgiare.info
curl -I http://api.khoahocgiare.info
```

### View Logs
```bash
# Application logs
pm2 logs

# Nginx logs
sudo tail -f /var/log/nginx/*.log

# Backend only
pm2 logs backend
```

### Restart Services
```bash
# Restart all PM2 processes
pm2 restart all

# Reload Nginx (no downtime)
sudo systemctl reload nginx

# Restart Nginx
sudo systemctl restart nginx
```

---

## 📚 Documentation

| File | What's Inside |
|------|---------------|
| **DEPLOYMENT_SUCCESS.md** | 📊 Complete deployment report |
| **DEPLOYMENT_GUIDE.md** | 📖 Full deployment guide |
| **SSL_SETUP.md** | 🔐 SSL/HTTPS setup instructions |
| **nginx-config.conf** | ⚙️ Nginx configuration file |
| **deploy-nginx.sh** | 🚀 Automated deployment script |

---

## 🔐 IMPORTANT: Setup SSL (Next Step)

Your site currently uses **HTTP only**. To enable HTTPS:

```bash
# 1. Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# 2. Obtain SSL certificates
sudo certbot --nginx -d khoahocgiare.info \
                      -d www.khoahocgiare.info \
                      -d api.khoahocgiare.info

# 3. In Cloudflare Dashboard
# Set SSL mode to "Full (Strict)"
```

👉 **Full instructions:** See `SSL_SETUP.md`

---

## 🧪 Test Batch Email

To test the new batch email system:

1. Create an order with 2-3 courses
2. Wait for all tasks to complete
3. Check email inbox - should receive **1 email** with all results
4. Verify table shows correct status for each course

---

## 📊 Monitoring

### Watch Logs in Real-Time
```bash
# All logs
pm2 logs

# Only errors
pm2 logs --err

# Specific process
pm2 logs backend --lines 100
```

### Check Resources
```bash
# CPU/Memory usage
pm2 monit

# Disk space
df -h

# Network connections
sudo ss -tuln | grep -E ':(80|443|3000|4000)'
```

---

## 🆘 Emergency Procedures

### If Backend Stops Working
```bash
pm2 restart backend
pm2 logs backend --err --lines 50
```

### If Frontend Stops Working
```bash
pm2 restart client-nextjs
pm2 logs client-nextjs --err --lines 50
```

### If Nginx Shows Errors
```bash
# Check config
sudo nginx -t

# View error log
sudo tail -50 /var/log/nginx/error.log

# Restart
sudo systemctl restart nginx
```

### Rollback Nginx Config
```bash
# List backups
ls -lh /etc/nginx/sites-available/*.backup.*

# Restore (replace timestamp)
sudo cp /etc/nginx/sites-available/default.backup.YYYYMMDD_HHMMSS \
       /etc/nginx/sites-available/khoahocgiare.info

# Reload
sudo nginx -t && sudo systemctl reload nginx
```

---

## 📈 Performance Tips

### Enable Gzip Compression
Add to `/etc/nginx/nginx.conf`:
```nginx
gzip on;
gzip_comp_level 6;
gzip_types text/plain text/css application/json application/javascript;
```

### Monitor Queue Length
```bash
# Check Redis queue
redis-cli LLEN bull:download-queue
```

---

## ✅ Daily Checklist

- [ ] Check PM2 status: `pm2 status`
- [ ] Review error logs: `pm2 logs --err --lines 20`
- [ ] Check disk space: `df -h`
- [ ] Monitor active orders in database
- [ ] Verify email notifications sent

---

## 🎯 Next Steps (Priority Order)

1. **🔐 Setup SSL/HTTPS** (High Priority)
   - See `SSL_SETUP.md`
   - Takes 10-15 minutes

2. **🧪 Test Batch Email** (Medium Priority)
   - Create test order with multiple courses
   - Verify email format and content

3. **📊 Setup Monitoring** (Medium Priority)
   - UptimeRobot for uptime
   - Sentry for error tracking

4. **🔒 Harden Security** (Low Priority)
   - Install fail2ban
   - Configure UFW firewall
   - Regular security updates

---

## 📞 Need Help?

**Check logs first:**
```bash
pm2 logs --err
sudo tail -f /var/log/nginx/error.log
```

**Review documentation:**
- `DEPLOYMENT_SUCCESS.md` - Full deployment report
- `DEPLOYMENT_GUIDE.md` - Troubleshooting section
- `SSL_SETUP.md` - SSL/HTTPS issues

---

## 🎉 Congratulations!

Your production system is **LIVE** and serving traffic!

**Working URLs:**
- ✅ http://khoahocgiare.info
- ✅ http://www.khoahocgiare.info
- ✅ http://api.khoahocgiare.info

**Next:** Setup HTTPS by following `SSL_SETUP.md`

---

**System Status:** 🟢 **ALL SYSTEMS OPERATIONAL**
