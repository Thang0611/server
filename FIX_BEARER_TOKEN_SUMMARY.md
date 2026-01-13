# 🔧 FIX: Bearer Token Missing - Worker Command

**Ngày:** 2026-01-13  
**Issue:** Task 28 thất bại - Command thiếu authentication  
**Root Cause:** Worker command không pass bearer token vào main.py

---

## 🔴 **VẤN ĐỀ PHÁT HIỆN**

### **Lỗi gốc:**
```
CRITICAL: Failed to find the course, are you enrolled?
```

### **Nguyên nhân THẬT SỰ:**
Command download thiếu **bearer token** để authenticate với Udemy API!

```python
# ❌ COMMAND CŨ (SAI):
cmd = [
    sys.executable, "main.py",
    "-c", course_url,
    "-o", task_sandbox,
    "-q", "720",
    # ← THIẾU: -b BEARER_TOKEN
    "--download-captions",
    "--download-assets",
    "--download-quizzes",
    "--concurrent-downloads", "10",
    "--continue-lecture-numbers"
]
```

**Kết quả:** 
- main.py không có authentication
- Udemy API reject request
- Error: "Failed to find the course, are you enrolled?"

---

## ✅ **FIX ĐÃ ÁP DỤNG**

### **File:** `/root/server/udemy_dl/worker_rq.py`
### **Line:** 218-229

```python
# ✅ COMMAND MỚI (ĐÚNG):
cmd = [
    sys.executable, "main.py",
    "-c", course_url,
    "-b", UDEMY_TOKEN,  # ← FIXED: Add bearer token
    "-o", task_sandbox,
    "-q", "720",
    "--download-captions",
    "--download-assets",
    "--download-quizzes",
    "--concurrent-downloads", "10",
    "--continue-lecture-numbers"
]
```

**Thay đổi:**
- ➕ Thêm `-b UDEMY_TOKEN` để pass bearer token
- ✅ Token đã được load từ .env file (line 50)
- ✅ Authentication sẽ hoạt động đúng

---

## 🔍 **TẠI SAO LỖI NÀY XẢY RA?**

### **1. Bearer Token là gì?**
Bearer token là authentication token để truy cập Udemy API:
```
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...
```

### **2. main.py cần token như thế nào?**
```python
# main.py usage:
python3 main.py -c COURSE_URL -b BEARER_TOKEN -o OUTPUT
```

Options:
- `-b BEARER_TOKEN` hoặc `--bearer BEARER_TOKEN`
- Hoặc `--browser chrome` để extract cookies từ browser

### **3. Worker đã có token chưa?**
```python
# Line 50: worker_rq.py
UDEMY_TOKEN = os.getenv('UDEMY_TOKEN')
```

✅ Token ĐÃ CÓ trong environment  
❌ Nhưng KHÔNG được pass vào command!

---

## 📊 **IMPACT ANALYSIS**

### **Trước khi fix:**
```
❌ Task 28: FAILED (no authentication)
❌ Task 99999: FAILED (test task)
⚠️  All future tasks sẽ fail tương tự
```

### **Sau khi fix:**
```
✅ Task mới sẽ có bearer token
✅ Authentication hoạt động
✅ Download thành công (nếu enrolled)
```

---

## 🧪 **VERIFY FIX**

### **Test 1: Check worker code**
```bash
cd /root/server/udemy_dl
grep -n "UDEMY_TOKEN" worker_rq.py

# Should see:
# Line 50: UDEMY_TOKEN = os.getenv('UDEMY_TOKEN')
# Line 222: "-b", UDEMY_TOKEN,  # New line!
```

### **Test 2: Check .env has token**
```bash
cd /root/server
grep UDEMY_TOKEN .env

# Should output:
# UDEMY_TOKEN=your_token_here
```

### **Test 3: Test manual command**
```bash
cd /root/server/udemy_dl
export UDEMY_TOKEN="your_token_here"

python3 main.py \
  -c "https://samsungu.udemy.com/course/test/" \
  -b "$UDEMY_TOKEN" \
  -o Test_Manual \
  -q 720 \
  --info

# Should NOT show "Failed to find the course" error
# Should show course info if enrolled
```

---

## 🔄 **RETRY TASK 28**

### **Bước 1: Restart worker để load code mới**
```bash
pm2 restart worker

# Or if not using PM2:
pkill -f worker_rq.py
python3 /root/server/udemy_dl/worker_rq.py &
```

### **Bước 2: Push Task 28 lại vào queue**
```bash
cd /root/server
node scripts/retry_task.js 28

# Or manually via Redis:
redis-cli LPUSH rq:queue:downloads '{"taskId":28,"email":"19d140071@gmail.com","courseUrl":"https://samsungu.udemy.com/course/tu-ong-hoa-cong-viec-bang-ai-agent-va-n8n/","timestamp":"2026-01-13T02:00:00.000Z","jobId":"task-28-retry"}'
```

### **Bước 3: Monitor logs**
```bash
# Watch worker logs
tail -f /root/server/logs/worker-out.log

# Should see:
# [DOWNLOAD] Command: python3 main.py -c ... -b BEARER_TOKEN ...
# ← Note: Bearer token is now included!
```

---

## 📋 **CHECKLIST**

- [x] ✅ Phát hiện root cause (thiếu bearer token)
- [x] ✅ Fix worker_rq.py (thêm `-b UDEMY_TOKEN`)
- [ ] ⏳ Restart worker process
- [ ] ⏳ Retry Task 28
- [ ] ⏳ Verify download successful
- [ ] ⏳ Update test scripts để check bearer token

---

## 🚨 **CẢN BÁO - KIỂM TRA THÊM**

### **⚠️ Warning 1: Token có valid không?**
```bash
# Check token format
echo $UDEMY_TOKEN | wc -c
# Should be > 100 characters

# Token format: eyJ...
echo $UDEMY_TOKEN | head -c 20
# Should start with "eyJ" (JWT format)
```

### **⚠️ Warning 2: Token có expire không?**
Bearer tokens thường có expiry time. Nếu token cũ (>30 days):
1. Login lại Udemy
2. Extract token mới từ browser
3. Update .env file

### **⚠️ Warning 3: Account có enrolled không?**
Sau khi fix bearer token, nếu vẫn lỗi:
- Check xem account có enrolled vào course chưa
- Bearer token CHỈ authenticate user
- Vẫn cần enrolled để download

---

## 🔍 **SO SÁNH LỖI**

### **Lỗi 1: No Bearer Token (LỖI NÀY)**
```
Command: python3 main.py -c URL -o OUTPUT
Error: Failed to find the course, are you enrolled?
Cause: Không có authentication, API reject
Fix: Thêm -b BEARER_TOKEN
```

### **Lỗi 2: No Session Files**
```
Command: python3 main.py -c URL --browser chrome
Error: No cookies found for browser: chrome
Cause: Chưa login qua browser
Fix: Login Udemy qua browser trước
```

### **Lỗi 3: Not Enrolled**
```
Command: python3 main.py -c URL -b TOKEN (có token, có auth)
Error: Failed to find the course, are you enrolled?
Cause: Account không có course trong library
Fix: Enroll account vào course
```

---

## 📚 **RELATED ISSUES**

### **Issue đã fix:**
1. ✅ Worker không pass bearer token (THIS FIX)

### **Issues khác (không liên quan):**
1. ⚠️ Database schema missing columns (separate issue)
2. ⚠️ No session files in saved/ (alternative auth method)
3. ⚠️ No PM2 workers found (monitoring issue)

---

## 🎯 **EXPECTED RESULT**

Sau khi fix + restart worker:

```bash
# Log output sẽ thấy:
[DOWNLOAD] Command: python3 main.py -c https://... -b eyJ... -o Staging_Download/Task_28 -q 720 ...

# Nếu enrolled:
✓ Course info retrieved
✓ Downloading lectures...
✓ Upload to Google Drive
✓ Task completed

# Nếu chưa enrolled:
✗ Failed to find the course, are you enrolled?
→ Cần enroll account vào course
```

---

## 📝 **UPDATE TEST SUITE**

Cần update test scripts để verify bearer token:

```javascript
// test_error_cases.js - Add new test
async function testBearerToken() {
  log.test('TEST: Bearer Token Configuration');
  
  // Check if UDEMY_TOKEN exists in .env
  const envContent = fs.readFileSync('.env', 'utf8');
  const hasToken = envContent.includes('UDEMY_TOKEN=');
  
  if (!hasToken) {
    results.failed.push('UDEMY_TOKEN not found in .env');
    log.error('UDEMY_TOKEN not configured');
  } else {
    results.passed.push('UDEMY_TOKEN configured');
    log.success('UDEMY_TOKEN found in .env');
  }
  
  // Check worker code includes bearer token
  const workerCode = fs.readFileSync('udemy_dl/worker_rq.py', 'utf8');
  const hasTokenInCmd = workerCode.includes('"-b", UDEMY_TOKEN');
  
  if (!hasTokenInCmd) {
    results.failed.push('Worker command missing -b flag');
    log.error('Worker not passing bearer token to main.py');
  } else {
    results.passed.push('Worker passes bearer token');
    log.success('Bearer token included in download command');
  }
}
```

---

## ✅ **SUMMARY**

| Item | Before | After |
|------|--------|-------|
| Command | `main.py -c URL -o OUTPUT` | `main.py -c URL -b TOKEN -o OUTPUT` |
| Authentication | ❌ None | ✅ Bearer Token |
| API Access | ❌ Rejected | ✅ Authenticated |
| Download | ❌ Failed | ✅ Can download (if enrolled) |
| Task 28 Status | ❌ FAILED | ⏳ Ready to retry |

---

**Fixed By:** AI Assistant  
**Date:** 2026-01-13 10:00:00 +07:00  
**Priority:** ⭐⭐⭐ CRITICAL  
**Status:** ✅ CODE FIXED - PENDING DEPLOYMENT
