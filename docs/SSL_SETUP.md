# SSL/HTTPS Setup Guide for KhoaHocGiaRe.info

## Overview

This guide covers **two SSL approaches** for your production setup with Cloudflare:

1. **Cloudflare Flexible SSL** (Easy, No server-side SSL needed)
2. **Cloudflare Full (Strict) SSL** (Recommended for production, requires Let's Encrypt)

---

## Option 1: Cloudflare Flexible SSL (Quick Setup)

### How it works:
```
User Browser → HTTPS (443) → Cloudflare → HTTP (80) → Your Nginx → Your App
             (Encrypted)                    (Unencrypted)
```

### Setup Steps:

1. **In Cloudflare Dashboard:**
   - Go to `SSL/TLS` → `Overview`
   - Set SSL mode to **"Flexible"**
   - Enable **"Always Use HTTPS"** under `SSL/TLS` → `Edge Certificates`

2. **Your Nginx stays HTTP-only** (current config works as-is)

3. **Test:**
   ```bash
   curl -I https://khoahocgiare.info
   ```

### ✅ Pros:
- No server-side SSL certificate needed
- Zero configuration on your server
- Works immediately

### ❌ Cons:
- Traffic between Cloudflare and your server is **unencrypted**
- Less secure (vulnerable to man-in-the-middle between CF and server)
- Not recommended for sensitive data (but OK for public content)

---

## Option 2: Cloudflare Full (Strict) SSL with Let's Encrypt (RECOMMENDED)

### How it works:
```
User Browser → HTTPS (443) → Cloudflare → HTTPS (443) → Your Nginx → Your App
             (Encrypted)                  (Encrypted)
```

### Prerequisites:
- Your DNS records must be set to **"DNS Only"** (orange cloud OFF) temporarily
- Ports 80 and 443 must be open on your firewall

---

### Step 1: Install Certbot

```bash
# Update package list
sudo apt update

# Install Certbot and Nginx plugin
sudo apt install certbot python3-certbot-nginx -y

# Verify installation
certbot --version
```

---

### Step 2: Obtain SSL Certificates

```bash
# For all domains (API + Frontend)
sudo certbot --nginx -d khoahocgiare.info \
                      -d www.khoahocgiare.info \
                      -d api.khoahocgiare.info

# Follow the prompts:
# - Enter your email address
# - Agree to Terms of Service
# - Choose option 2: Redirect HTTP to HTTPS (recommended)
```

**What Certbot does:**
- Validates domain ownership via HTTP-01 challenge
- Obtains certificates from Let's Encrypt
- Automatically modifies your Nginx config to add SSL
- Sets up auto-renewal via systemd timer

---

### Step 3: Verify SSL Configuration

```bash
# Test Nginx config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Check SSL certificate details
sudo certbot certificates
```

---

### Step 4: Enable Cloudflare Full (Strict) Mode

1. **In Cloudflare Dashboard:**
   - Go to `SSL/TLS` → `Overview`
   - Set SSL mode to **"Full (strict)"**

2. **Turn Cloudflare Proxy back ON:**
   - Go to `DNS` → `Records`
   - Click on orange cloud icon to enable proxy for:
     - `khoahocgiare.info`
     - `www.khoahocgiare.info`
     - `api.khoahocgiare.info`

3. **Enable additional security features:**
   - `SSL/TLS` → `Edge Certificates`:
     - ✅ Always Use HTTPS
     - ✅ Automatic HTTPS Rewrites
     - ✅ Minimum TLS Version: 1.2
     - ✅ TLS 1.3: Enabled

---

### Step 5: Test Auto-Renewal

```bash
# Dry-run renewal (doesn't actually renew)
sudo certbot renew --dry-run

# If successful, auto-renewal is configured!
# Certbot runs twice daily via systemd timer
```

Check renewal timer:
```bash
sudo systemctl list-timers | grep certbot
```

---

### Step 6: Updated Nginx Configuration (SSL Version)

After Certbot runs, your config will look like this:

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    
    server_name api.khoahocgiare.info;
    
    # SSL Certificate (managed by Certbot)
    ssl_certificate /etc/letsencrypt/live/khoahocgiare.info/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/khoahocgiare.info/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    
    # ... rest of your config ...
}

# HTTP to HTTPS redirect (added by Certbot)
server {
    listen 80;
    listen [::]:80;
    server_name api.khoahocgiare.info;
    
    return 301 https://$host$request_uri;
}
```

---

## SSL Verification & Testing

### 1. Test SSL Grade
```bash
# Check SSL configuration quality
curl -I https://khoahocgiare.info

# Or use online tools:
# https://www.ssllabs.com/ssltest/
```

### 2. Check Certificate Expiry
```bash
sudo certbot certificates

# Output example:
# Certificate Name: khoahocgiare.info
#   Domains: khoahocgiare.info www.khoahocgiare.info api.khoahocgiare.info
#   Expiry Date: 2026-04-12 12:34:56+00:00 (VALID: 89 days)
```

### 3. Test Real IP Forwarding (with SSL)
```bash
# Your backend should see real visitor IP, not Cloudflare IP
curl -I https://api.khoahocgiare.info/health
```

---

## Troubleshooting

### Issue 1: Certbot fails with "Connection refused"
**Cause:** Nginx is not running or port 80 is blocked

**Fix:**
```bash
sudo systemctl start nginx
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

---

### Issue 2: "Too many certificates already issued"
**Cause:** Let's Encrypt rate limit (5 certs per week per domain)

**Fix:**
- Wait 7 days, OR
- Use staging environment for testing:
  ```bash
  sudo certbot --nginx --staging
  ```

---

### Issue 3: Cloudflare shows "Your connection is not private"
**Cause:** SSL mode mismatch

**Fix:**
- Ensure SSL mode in Cloudflare is **"Full (strict)"** not "Flexible"
- Verify certificate is valid: `sudo certbot certificates`

---

### Issue 4: Certificate renewal fails
**Fix:**
```bash
# Check logs
sudo journalctl -u certbot.timer

# Manually renew
sudo certbot renew --force-renewal

# Reload Nginx after renewal
sudo systemctl reload nginx
```

---

## Certificate Renewal Process

Let's Encrypt certificates expire every **90 days**. Certbot auto-renews them.

### Manual Renewal (if needed):
```bash
# Renew all certificates
sudo certbot renew

# Renew specific domain
sudo certbot renew --cert-name khoahocgiare.info

# Reload Nginx to use new certificates
sudo systemctl reload nginx
```

### Monitor Renewal:
```bash
# Check last renewal attempt
sudo journalctl -u certbot.timer --since "7 days ago"

# Test renewal (doesn't actually renew)
sudo certbot renew --dry-run
```

---

## Cloudflare SSL/TLS Recommended Settings

| Setting | Recommended Value | Location |
|---------|------------------|----------|
| SSL Mode | Full (strict) | SSL/TLS → Overview |
| Always Use HTTPS | ✅ ON | SSL/TLS → Edge Certificates |
| Minimum TLS Version | 1.2 | SSL/TLS → Edge Certificates |
| TLS 1.3 | ✅ ON | SSL/TLS → Edge Certificates |
| Automatic HTTPS Rewrites | ✅ ON | SSL/TLS → Edge Certificates |
| Certificate Transparency Monitoring | ✅ ON | SSL/TLS → Edge Certificates |
| HSTS | ✅ ON (after testing) | SSL/TLS → Edge Certificates |

---

## HSTS Configuration (Optional - After SSL is stable)

Add to your Nginx config:

```nginx
# Add inside each server block (443 only)
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
```

Then reload Nginx:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## Summary: Which SSL Option to Choose?

| Scenario | Recommended Option |
|----------|-------------------|
| Quick testing/demo | Cloudflare Flexible SSL |
| Production with public data | Cloudflare Full (Strict) + Let's Encrypt |
| Production with sensitive data (payments, etc) | Cloudflare Full (Strict) + Let's Encrypt + HSTS |

---

## Quick Commands Reference

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtain SSL certificates
sudo certbot --nginx -d khoahocgiare.info -d www.khoahocgiare.info -d api.khoahocgiare.info

# Test auto-renewal
sudo certbot renew --dry-run

# Check certificates
sudo certbot certificates

# Manually renew
sudo certbot renew

# Check renewal timer
sudo systemctl list-timers | grep certbot

# Reload Nginx after cert changes
sudo systemctl reload nginx
```

---

## Support

If you encounter issues:
1. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
2. Check Certbot logs: `sudo journalctl -u certbot.timer`
3. Verify DNS propagation: `dig khoahocgiare.info`
4. Test SSL: https://www.ssllabs.com/ssltest/

---

**🎉 After SSL setup, your site will be:**
- ✅ Fully encrypted end-to-end
- ✅ Secured with A+ SSL rating
- ✅ Auto-renewing certificates
- ✅ Production-ready!
