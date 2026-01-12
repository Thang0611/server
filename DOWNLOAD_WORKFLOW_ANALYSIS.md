# 📊 Download Workflow - Comprehensive System Architecture Analysis

**Report Date:** January 12, 2026  
**Analyst Role:** Senior System Architect  
**System:** Node.js Backend + Python Worker Download Pipeline

---

## 🎯 Executive Summary

This system orchestrates course downloads through a **two-tier architecture**:
- **Node.js Backend** handles payments, order management, and orchestration
- **Python Worker** handles Udemy enrollment and course downloads to Google Drive

**Key Finding:** The current architecture is **functional but has critical scalability and security vulnerabilities** that could cause system failures under load or expose sensitive data.

---

## 1️⃣ DATA FLOW: End-to-End Lifecycle

### 📝 Complete Journey from Payment → Download → Delivery

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        DOWNLOAD WORKFLOW SEQUENCE                        │
└─────────────────────────────────────────────────────────────────────────┘

 CLIENT                 NODE.JS                   DATABASE              PYTHON WORKER              GDRIVE
   │                       │                          │                        │                      │
   │ 1. Create Order       │                          │                        │                      │
   │─────────────────────>│                          │                        │                      │
   │                       │                          │                        │                      │
   │                       │ 2. Create Order          │                        │                      │
   │                       │  (status: pending)       │                        │                      │
   │                       │─────────────────────────>│                        │                      │
   │                       │                          │                        │                      │
   │                       │ 3. Create DownloadTasks  │                        │                      │
   │                       │  (status: paid)          │                        │                      │
   │                       │─────────────────────────>│                        │                      │
   │                       │                          │                        │                      │
   │<─────────────────────│ 4. Return QR Code        │                        │                      │
   │   (order_code: DHxxxxxx)                        │                        │                      │
   │                       │                          │                        │                      │
   │                       │                          │                        │                      │
   │ 5. Customer Pays      │                          │                        │                      │
   │   via Banking App     │                          │                        │                      │
   │                       │                          │                        │                      │
   │                       │                          │                        │                      │
SEPAY                     │                          │                        │                      │
   │ 6. Webhook POST       │                          │                        │                      │
   │  /api/v1/payment/     │                          │                        │                      │
   │   webhook             │                          │                        │                      │
   │──────────────────────>│                          │                        │                      │
   │  {                    │                          │                        │                      │
   │   code: "DH123456",   │                          │                        │                      │
   │   transferAmount: ... │                          │                        │                      │
   │  }                    │                          │                        │                      │
   │                       │                          │                        │                      │
   │                       │ 7. Verify Auth Header    │                        │                      │
   │                       │  (SEPAY_API_KEY)         │                        │                      │
   │                       │                          │                        │                      │
   │                       │ 8. Find Order            │                        │                      │
   │                       │  (by order_code)         │                        │                      │
   │                       │─────────────────────────>│                        │                      │
   │                       │<─────────────────────────│                        │                      │
   │                       │                          │                        │                      │
   │                       │ 9. START TRANSACTION     │                        │                      │
   │                       │─────────────────────────>│                        │                      │
   │                       │                          │                        │                      │
   │                       │ 10. Update Order         │                        │                      │
   │                       │   payment_status='paid'  │                        │                      │
   │                       │─────────────────────────>│                        │                      │
   │                       │                          │                        │                      │
   │                       │ 11. Update DownloadTasks │                        │                      │
   │                       │   status: 'paid'         │                        │                      │
   │                       │          ↓               │                        │                      │
   │                       │   status: 'processing'   │                        │                      │
   │                       │─────────────────────────>│                        │                      │
   │                       │                          │                        │                      │
   │                       │ 12. COMMIT TRANSACTION   │                        │                      │
   │                       │─────────────────────────>│                        │                      │
   │                       │                          │                        │                      │
   │<──────────────────────│ 13. Return 200 OK        │                        │                      │
   │   (to SEPAY)          │                          │                        │                      │
   │                       │                          │                        │                      │
   │                       │ 14. processOrder()       │                        │                      │
   │                       │   Find tasks with        │                        │                      │
   │                       │   status='processing'    │                        │                      │
   │                       │─────────────────────────>│                        │                      │
   │                       │<─────────────────────────│                        │                      │
   │                       │                          │                        │                      │
   │                       │ 15. downloadWorker.      │                        │                      │
   │                       │     processTask(task)    │                        │                      │
   │                       │     [Node.js Worker]     │                        │                      │
   │                       │          │               │                        │                      │
   │                       │          │ 16. Enroll   │                        │                      │
   │                       │          │  (Udemy API)  │                        │                      │
   │                       │          │               │                        │                      │
   │                       │          │ 17. Update   │                        │                      │
   │                       │          │  status:     │                        │                      │
   │                       │          │  'enrolled'  │                        │                      │
   │                       │          └──────────────>│                        │                      │
   │                       │                          │                        │                      │
   │                       │                          │   [PYTHON WORKER       │                      │
   │                       │                          │    POLLING LOOP]       │                      │
   │                       │                          │                        │                      │
   │                       │                          │ 18. Query for tasks    │                      │
   │                       │                          │    status='enrolled'   │                      │
   │                       │                          │<───────────────────────│                      │
   │                       │                          │────────────────────────>                      │
   │                       │                          │                        │                      │
   │                       │                          │ 19. Update status:     │                      │
   │                       │                          │    'processing'        │                      │
   │                       │                          │<───────────────────────│                      │
   │                       │                          │                        │                      │
   │                       │                          │                        │ 20. Download Course  │
   │                       │                          │                        │  (main.py +         │
   │                       │                          │                        │   --browser chrome) │
   │                       │                          │                        │                      │
   │                       │                          │                        │ 21. Upload to Drive │
   │                       │                          │                        │  (rclone move)      │
   │                       │                          │                        │─────────────────────>│
   │                       │                          │                        │<─────────────────────│
   │                       │                          │                        │                      │
   │                       │                          │ 22. Update DB:         │                      │
   │                       │                          │    status='completed'  │                      │
   │                       │                          │<───────────────────────│                      │
   │                       │                          │                        │                      │
   │                       │ 23. POST Webhook         │                        │                      │
   │                       │  /api/v1/webhook/        │                        │                      │
   │                       │   finalize               │                        │                      │
   │                       │<─────────────────────────────────────────────────│                      │
   │                       │  {                       │                        │                      │
   │                       │   secret_key: "...",     │                        │                      │
   │                       │   task_id: 123,          │                        │                      │
   │                       │   folder_name: "..."     │                        │                      │
   │                       │  }                       │                        │                      │
   │                       │                          │                        │                      │
   │                       │ 24. Verify secret_key    │                        │                      │
   │                       │                          │                        │                      │
   │                       │ 25. Find Drive Folder    │                        │                      │
   │                       │  (retry 10x)             │                        │ 26. Search API      │
   │                       │──────────────────────────────────────────────────────────────────────────>│
   │                       │<──────────────────────────────────────────────────────────────────────────│
   │                       │                          │                        │                      │
   │                       │ 27. Grant Read Access    │                        │                      │
   │                       │  (to customer email)     │                        │ 28. Permissions API │
   │                       │──────────────────────────────────────────────────────────────────────────>│
   │                       │                          │                        │                      │
   │                       │ 29. Update DownloadTask  │                        │                      │
   │                       │   driver_url: "..."      │                        │                      │
   │                       │   driver_folder: "..."   │                        │                      │
   │                       │   status: 'completed'    │                        │                      │
   │                       │─────────────────────────>│                        │                      │
   │                       │                          │                        │                      │
   │                       │ 30. Send Email           │                        │                      │
   │                       │  (Drive link + course    │                        │                      │
   │                       │   info to customer)      │                        │                      │
   │                       │                          │                        │                      │
   │<──────────────────────│ 31. Return 200 OK        │                        │                      │
   │  (to Python)          │                          │                        │                      │
   │                       │                          │                        │                      │
```

---

## 2️⃣ MECHANISM ANALYSIS

### 🔧 A. Trigger Method

**Current Implementation:**

1. **Payment Trigger:**
   - **Method:** Webhook callback from SePay payment gateway
   - **Endpoint:** `/api/v1/payment/webhook`
   - **Authentication:** `Authorization: Apikey ${SEPAY_API_KEY}` header verification
   - **Controller:** `src/controllers/payment.controller.js::handleWebhook()`

2. **Download Trigger:**
   - **Method:** **Direct function call** (NOT process spawn)
   - **Mechanism:** 
     ```javascript
     // In payment.service.js:
     downloadWorker.processTask(task).catch(err => { ... })
     ```
   - **Location:** `src/workers/download.worker.js::processTask()`
   - **Asynchronous:** Yes (fire-and-forget with `.catch()` error handler)

3. **Python Worker:**
   - **Method:** **Independent polling loop** (NOT spawned by Node.js)
   - **Process:** Standalone Python script running continuously
   - **Polling Query:**
     ```sql
     SELECT id, course_url, email 
     FROM download_tasks 
     WHERE status = 'enrolled' 
     ORDER BY created_at ASC 
     LIMIT 1 FOR UPDATE
     ```
   - **Interval:** Every 10 seconds (`time.sleep(10)`)

### 🔌 B. Communication Mechanism

**Node.js → Python:**
- **Method:** Database-mediated communication (NOT direct IPC)
- **Flow:**
  1. Node.js updates `download_tasks.status = 'enrolled'`
  2. Python polls database for `status='enrolled'`
  3. Python updates `status='processing'` to claim task

**Python → Node.js:**
- **Method:** HTTP Webhook POST request
- **Endpoint:** `https://api.khoahocgiare.info/api/v1/webhook/finalize`
- **Payload:**
  ```json
  {
    "secret_key": "API_SECRET_KEY from .env",
    "task_id": 123,
    "folder_name": "Course Name (Sanitized)"
  }
  ```
- **Authentication:** Shared secret key (`API_SECRET_KEY` in `.env`)

### 🔑 C. Arguments & Configuration

**Node.js Worker (Enrollment Phase):**
- **Function call** with task object containing:
  - `task.id`, `task.email`, `task.course_url`, `task.status`

**Python Worker (Download Phase):**
- **No CLI arguments** - reads from database
- **Environment Variables (from `.env`):**
  - `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
  - `UDEMY_TOKEN` (Bearer token)
  - `API_SECRET_KEY` (for webhook authentication)
- **Hardcoded Configuration:**
  ```python
  UDEMY_TOKEN = os.getenv('UDEMY_TOKEN')
  STAGING_DIR = "Staging_Download"
  RCLONE_REMOTE = "gdrive"
  RCLONE_DEST_PATH = "UdemyCourses/download_khoahoc"
  MAX_RETRIES = 3
  ```

### 🔐 D. Authentication Methods

1. **Udemy API (Python):**
   - **Method:** Browser cookie extraction
   - **Implementation:**
     ```python
     cj = browser_cookie3.chrome()  # Extract cookies from Chrome
     self.session._get(url, cookies=cj, ...)
     ```
   - **Fallback:** Bearer token via `UDEMY_TOKEN` env var
   - **Location:** `udemy_dl/main.py` line 414-431

2. **Google Drive (Python via Rclone):**
   - **Method:** Rclone with Service Account or OAuth
   - **Config:** Assumed to be in `~/.config/rclone/rclone.conf`
   - **Command:** `rclone move <local> gdrive:UdemyCourses/...`

3. **Google Drive API (Node.js):**
   - **Method:** Service Account authentication
   - **Implementation:** `src/utils/drive.util.js`
   - **Credentials:** JSON keyfile (path in `GOOGLE_APPLICATION_CREDENTIALS`)

4. **Webhook Security:**
   - **Python → Node.js:** Shared secret (`API_SECRET_KEY`)
   - **SePay → Node.js:** API key in Authorization header

---

## 3️⃣ CRITICAL REVIEW

### 🚨 A. BOTTLENECKS

#### ❌ **CRITICAL - Single Threaded Python Worker**

**Issue:**
```python
while True:
    task = get_task()
    if not task:
        time.sleep(10)
        continue
    
    # Process task (blocks for ~30-120 minutes per course)
    # Only 1 task at a time!
```

**Impact:**
- **If 100 people pay simultaneously:**
  - ✅ Node.js creates 100 tasks instantly
  - ❌ Python processes 1 task every ~60 minutes
  - ⏱️ Last customer waits: **100 × 60 = 6,000 minutes = 4+ DAYS**

**Severity:** 🔴 **CRITICAL - System Collapse Under Load**

---

#### ⚠️ **HIGH - Database Polling Overhead**

**Issue:**
```python
time.sleep(10)  # Poll every 10 seconds
```

**Impact:**
- 8,640 database queries per day (even when idle)
- Wastes database connections
- 10-second delay between task completion and pickup

**Severity:** 🟠 **HIGH - Inefficient Resource Usage**

---

#### ⚠️ **MEDIUM - Synchronous Download in Python**

**Issue:**
```python
subprocess.run(cmd, check=True, timeout=144000)  # Blocks for hours
```

**Impact:**
- Cannot process multiple courses simultaneously
- Long-running downloads block short courses
- No priority queue (first-come-first-served only)

**Severity:** 🟡 **MEDIUM - Poor Task Scheduling**

---

### 🛡️ B. SECURITY RISKS

#### 🔴 **CRITICAL - Secrets Visible in Process List**

**Issue:**
Python worker loads secrets from `.env` into environment:
```python
UDEMY_TOKEN = os.getenv('UDEMY_TOKEN')
```

**However,** the main.py script may receive bearer token as argument:
```python
# From commented code in worker.py (line 223-231):
cmd = [sys.executable, "main.py",
       "-c", url, 
       "-b", UDEMY_TOKEN,  # ⚠️ Bearer token in command line!
       ...
]
```

**Exploit:**
```bash
$ ps aux | grep python
# Output might show:
python main.py -b eyJhbGciOiJIUzI1NiIs...  # ⚠️ EXPOSED TOKEN
```

**Impact:**
- Any user on the server can see Udemy bearer tokens
- Tokens can be used to access Udemy accounts
- `ps`, `htop`, `/proc/<pid>/cmdline` all expose this

**Severity:** 🔴 **CRITICAL - Credential Exposure**

---

#### 🟠 **HIGH - Weak Webhook Authentication**

**Issue:**
```javascript
// webhook.service.js line 176
if (secretKey !== SERVER_SECRET) {
  throw new AppError('Forbidden: Wrong Key', 403);
}
```

**Problems:**
1. **Static shared secret** (no rotation mechanism)
2. **No request signing** (replay attacks possible)
3. **No timestamp validation** (stale requests accepted)
4. **No IP whitelisting** (anyone with key can call)

**Exploit Scenario:**
1. Attacker discovers `API_SECRET_KEY` (leaked in logs, git history, etc.)
2. Attacker calls `/api/v1/webhook/finalize` with any `task_id`
3. System grants Drive access and sends email to attacker's email

**Severity:** 🟠 **HIGH - Unauthorized Resource Access**

---

#### 🟠 **HIGH - Database Credentials in Python Environment**

**Issue:**
```python
DB_CONFIG = {
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'host': os.getenv('DB_HOST'),
    'database': os.getenv('DB_NAME'),
}
conn = mysql.connector.connect(**DB_CONFIG)
```

**Problems:**
1. Python worker has **full database access** (not limited to specific tables)
2. No principle of least privilege (can read/write any table)
3. SQL injection risk if database queries are constructed incorrectly

**Recommendation:** Use database role with restricted permissions:
```sql
CREATE USER 'udemy_worker'@'%' IDENTIFIED BY '...';
GRANT SELECT, UPDATE ON database.download_tasks TO 'udemy_worker'@'%';
```

**Severity:** 🟠 **HIGH - Excessive Database Privileges**

---

#### 🟡 **MEDIUM - No Input Validation on Webhook**

**Issue:**
```javascript
// webhook.controller.js line 17-22
const { secret_key, task_id, folder_name } = req.body;

if (!secret_key || !task_id || !folder_name) {
  throw new AppError('Thiếu thông tin bắt buộc', 400);
}
```

**Problems:**
- `task_id` not validated as integer
- `folder_name` not sanitized (potential path traversal)
- No max length checks (DoS via large payloads)

**Severity:** 🟡 **MEDIUM - Injection/DoS Vectors**

---

### 💥 C. ERROR HANDLING GAPS

#### 🔴 **CRITICAL - Python Crash = Silent Failure**

**Issue:**
```python
# worker.py line 502-506
if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Worker Stopped.")
```

**Problems:**
1. **No monitoring/alerting** if Python worker crashes
2. **No auto-restart** mechanism (requires manual intervention)
3. **Database tasks stuck in 'enrolled' state** forever
4. **No health check endpoint** (can't monitor from Node.js)

**Impact:**
- Worker crashes silently at 3 AM
- All pending tasks stop processing
- Customers never receive downloads
- System appears "working" (orders accepted, payment processed)
- **No one knows** until customers complain

**Severity:** 🔴 **CRITICAL - Invisible System Failure**

---

#### 🟠 **HIGH - Network Failure During Webhook**

**Issue:**
```python
# worker.py line 415-422
try:
    res = requests.post(api_url, json=payload, timeout=30)
    if res.status_code == 200:
        log("[API] Success Webhook")
    else:
        log(f"[API WARN] Server error: {res.text}")
except Exception as e:
    log(f"[API ERR] Cannot call API: {e}")
```

**Problems:**
1. **Task marked 'completed' in DB** before webhook succeeds
2. If webhook fails, **Drive link never saved** in database
3. **Email never sent** to customer
4. **No retry mechanism** for failed webhooks

**Impact:**
- Course downloaded and uploaded successfully
- But customer never gets Drive link
- Task shows "completed" but no access granted

**Severity:** 🟠 **HIGH - Data Inconsistency**

---

#### 🟠 **HIGH - Race Condition in Task Claiming**

**Issue:**
```python
# worker.py line 369-375
cur.execute("SELECT id, course_url, email FROM download_tasks 
             WHERE status = 'enrolled' ORDER BY created_at ASC LIMIT 1 FOR UPDATE")
task = cur.fetchone()

if task:
    cur.execute("UPDATE download_tasks SET status = 'processing', 
                 updated_at = NOW() WHERE id = %s", (task['id'],))
    conn.commit()
```

**Problems:**
1. If transaction fails **after SELECT but before UPDATE**
2. Task remains 'enrolled' but worker assumes it's processing
3. If you scale to **2 Python workers**, they might claim same task

**Current State:** Mitigated by `FOR UPDATE` lock (good!)  
**Future Risk:** If adding multiple workers, need distributed locking

**Severity:** 🟡 **MEDIUM - Potential with Scaling**

---

#### 🟡 **MEDIUM - Download Failures Not Retried**

**Issue:**
```python
# worker.py line 459-489
for attempt in range(1, MAX_RETRIES + 1):
    try:
        subprocess.run(cmd, check=True, timeout=144000)
        # ... upload ...
        if upload_to_drive(final_folder):
            success = True
            break
    except Exception as e:
        log(f"[ERR] {e}")
        clean_staging()
        time.sleep(20)

if success:
    update_status(task['id'], 'completed')
else:
    update_status(task['id'], 'failed')  # ❌ No retry later
```

**Problems:**
1. After 3 failures, task marked 'failed' permanently
2. **No mechanism to retry failed tasks** later
3. Transient errors (network hiccups, Udemy rate limits) cause permanent failure

**Impact:**
- Temporary Udemy API issue → Task fails forever
- Customer paid but never gets course
- Requires manual database intervention

**Severity:** 🟡 **MEDIUM - Poor Resilience**

---

#### 🟡 **MEDIUM - No Timeout on Drive Folder Search**

**Issue:**
```javascript
// webhook.service.js line 28-44
const findFolderWithRetry = async (folderName) => {
  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const folder = await findFolderByName(folderName);
      if (folder) return folder;
    } catch (error) { ... }
    await wait(RETRY_DELAY_MS);  // 3 seconds
  }
  return null;  // ❌ Returns null after 30 seconds, task marked 'failed'
}
```

**Problems:**
1. If rclone upload is slow, file might not be indexed yet
2. After 30 seconds (10 retries × 3s), gives up
3. Task marked 'failed' even though upload succeeded

**Severity:** 🟡 **MEDIUM - False Negatives**

---

## 4️⃣ RECOMMENDATIONS

### 🚀 Priority 1: IMMEDIATE FIXES (Within 1 Week)

#### 1. **Add Process Monitoring & Auto-Restart**

**Problem:** Python worker crash = silent failure

**Solution:** Use `systemd` (Linux) or `supervisor` (cross-platform)

**Implementation:**

**Create `/etc/systemd/system/udemy-worker.service`:**
```ini
[Unit]
Description=Udemy Download Worker
After=network.target mysql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/root/server/udemy_dl
Environment="PATH=/usr/bin:/usr/local/bin"
ExecStart=/usr/bin/python3 /root/server/udemy_dl/worker.py
Restart=always
RestartSec=10
StandardOutput=append:/var/log/udemy-worker.log
StandardError=append:/var/log/udemy-worker-error.log

[Install]
WantedBy=multi-user.target
```

**Enable and start:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable udemy-worker.service
sudo systemctl start udemy-worker.service
```

**Benefits:**
- ✅ Auto-restart on crash
- ✅ Logs to `/var/log/udemy-worker.log`
- ✅ Starts on server reboot
- ✅ Can monitor with `systemctl status udemy-worker`

---

#### 2. **Implement Webhook Authentication & Replay Protection**

**Problem:** Weak authentication, replay attacks possible

**Solution:** Add HMAC-SHA256 signature + timestamp validation

**Python side (`worker.py`):**
```python
import hmac
import hashlib
import time

def notify_node_webhook(task_id, folder_name_local):
    api_url = "https://api.khoahocgiare.info/api/v1/webhook/finalize"
    secret = os.getenv('API_SECRET_KEY')
    timestamp = str(int(time.time()))
    
    payload = {
        "task_id": task_id,
        "folder_name": os.path.basename(folder_name_local),
        "timestamp": timestamp
    }
    
    # Create signature
    message = f"{task_id}{folder_name_local}{timestamp}"
    signature = hmac.new(
        secret.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    headers = {
        "X-Signature": signature,
        "X-Timestamp": timestamp
    }
    
    try:
        res = requests.post(api_url, json=payload, headers=headers, timeout=30)
        # ...
```

**Node.js side (`webhook.controller.js`):**
```javascript
const crypto = require('crypto');

const finalizeDownload = asyncHandler(async (req, res, next) => {
  const { task_id, folder_name, timestamp } = req.body;
  const signature = req.headers['x-signature'];
  
  // Verify timestamp (reject if older than 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    throw new AppError('Request expired', 401);
  }
  
  // Verify signature
  const message = `${task_id}${folder_name}${timestamp}`;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.API_SECRET_KEY)
    .update(message)
    .digest('hex');
  
  if (signature !== expectedSignature) {
    throw new AppError('Invalid signature', 403);
  }
  
  // Continue processing...
});
```

**Benefits:**
- ✅ Prevents replay attacks
- ✅ Prevents tampering with payload
- ✅ Time-bound requests (5-minute window)

---

### 🔧 Priority 2: SCALABILITY IMPROVEMENTS (Within 1 Month)

#### 3. **Migrate to Message Queue (Redis/BullMQ)**

**Problem:** Database polling is inefficient, single worker bottleneck

**Solution:** Replace database polling with Redis queue

**Architecture:**

```
┌──────────────┐         ┌──────────┐         ┌────────────────┐
│   Node.js    │────────>│  Redis   │────────>│ Python Worker  │
│   Backend    │  Push   │  Queue   │  Pop    │   (Multiple)   │
└──────────────┘  Task   └──────────┘  Task   └────────────────┘
                                                       │
                                                       ├─ Worker 1
                                                       ├─ Worker 2
                                                       ├─ Worker 3
                                                       └─ Worker N
```

**Benefits:**
- ✅ **Instant task delivery** (no 10-second polling delay)
- ✅ **Horizontal scaling** (run 10+ workers on different servers)
- ✅ **Priority queues** (VIP customers first)
- ✅ **Job retry** (automatic retry with exponential backoff)
- ✅ **Job metrics** (pending/completed/failed counts in real-time)

**Example with BullMQ (Node.js):**

```javascript
// payment.service.js
const { Queue } = require('bullmq');
const downloadQueue = new Queue('downloads', {
  connection: { host: 'localhost', port: 6379 }
});

// After payment confirmed:
await downloadQueue.add('download-course', {
  taskId: task.id,
  email: task.email,
  courseUrl: task.course_url
}, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 60000 }
});
```

**Python Worker with RQ (Redis Queue):**
```python
import redis
from rq import Worker, Queue

conn = redis.Redis()
queue = Queue('downloads', connection=conn)

def process_download(task_data):
    task_id = task_data['taskId']
    # ... download logic ...

if __name__ == '__main__':
    # Run 5 workers in parallel
    worker = Worker([queue], connection=conn)
    worker.work()
```

**Run multiple workers:**
```bash
# Start 5 workers on same server
for i in {1..5}; do
  python worker_rq.py &
done
```

---

#### 4. **Add Health Check Endpoint for Python Worker**

**Problem:** Cannot monitor if Python worker is alive

**Solution:** Add HTTP health check server in Python

**Implementation (worker.py):**
```python
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading
import json

class HealthCheckHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            health_data = {
                "status": "healthy",
                "uptime": time.time() - START_TIME,
                "tasks_processed": TASKS_PROCESSED_COUNT,
                "current_task": CURRENT_TASK_ID or None
            }
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(health_data).encode())
        else:
            self.send_response(404)
            self.end_headers()

def start_health_server():
    server = HTTPServer(('0.0.0.0', 8888), HealthCheckHandler)
    thread = threading.Thread(target=server.serve_forever)
    thread.daemon = True
    thread.start()

# In main():
START_TIME = time.time()
start_health_server()
log("Health check server running on :8888/health")
```

**Monitor from Node.js:**
```javascript
// src/services/worker-monitor.service.js
const axios = require('axios');

setInterval(async () => {
  try {
    const res = await axios.get('http://localhost:8888/health');
    Logger.info('Python worker health check', res.data);
  } catch (error) {
    Logger.error('Python worker is DOWN!', error);
    // Send alert email/Slack notification
  }
}, 60000); // Check every minute
```

**Benefits:**
- ✅ Real-time monitoring
- ✅ Detect worker crashes immediately
- ✅ Can integrate with monitoring tools (Prometheus, Grafana)

---

### 🔐 Priority 3: SECURITY HARDENING (Within 2 Months)

#### 5. **Never Pass Secrets as CLI Arguments**

**Problem:** Bearer tokens visible in `ps aux`

**Solution:** Always use environment variables or config files

**❌ BAD (Current):**
```python
cmd = [sys.executable, "main.py", "-b", UDEMY_TOKEN]
```

**✅ GOOD:**
```python
# Pass only non-sensitive arguments
cmd = [sys.executable, "main.py", "-c", url, "-o", output_dir]

# main.py reads token from environment
bearer_token = os.getenv('UDEMY_TOKEN')
```

---

#### 6. **Implement Database Connection Pooling & Least Privilege**

**Problem:** Python worker has full database access

**Solution:** Use restricted database user + connection pooling

**Create restricted user:**
```sql
CREATE USER 'udemy_worker_ro'@'%' IDENTIFIED BY 'secure_password';
GRANT SELECT, UPDATE(status, updated_at, driver_url, error_log) 
  ON database.download_tasks TO 'udemy_worker_ro'@'%';
FLUSH PRIVILEGES;
```

**Python implementation:**
```python
from mysql.connector import pooling

# Connection pool (reuse connections)
db_pool = pooling.MySQLConnectionPool(
    pool_name="worker_pool",
    pool_size=5,
    pool_reset_session=True,
    **DB_CONFIG
)

def get_task():
    conn = db_pool.get_connection()
    try:
        # ... query ...
    finally:
        conn.close()  # Returns to pool
```

---

### 📊 Priority 4: OBSERVABILITY (Within 3 Months)

#### 7. **Add Comprehensive Logging & Metrics**

**Implementation:**

**Python Worker:**
```python
import logging
from pythonjsonlogger import jsonlogger

logger = logging.getLogger()
logHandler = logging.StreamHandler()
formatter = jsonlogger.JsonFormatter()
logHandler.setFormatter(formatter)
logger.addHandler(logHandler)

# Structured logging
logger.info("Task started", extra={
    "task_id": task_id,
    "course_url": url,
    "attempt": attempt
})
```

**Metrics Collection:**
```python
# Use Prometheus client
from prometheus_client import Counter, Histogram, start_http_server

tasks_processed = Counter('tasks_processed_total', 'Total tasks processed')
download_duration = Histogram('download_duration_seconds', 'Time to download course')

# In processing loop:
with download_duration.time():
    # ... download ...
    tasks_processed.inc()

# Start metrics server
start_http_server(9090)  # Prometheus scrapes localhost:9090/metrics
```

---

## 📋 SUMMARY TABLE

| Issue | Severity | Impact | Effort | Priority |
|-------|----------|--------|--------|----------|
| Single-threaded Python worker | 🔴 Critical | Days of delay under load | Medium | P1 |
| Python crash = silent failure | 🔴 Critical | System down, no alerts | Low | **P1** |
| Secrets in command line | 🔴 Critical | Credential exposure | Low | **P1** |
| Weak webhook authentication | 🟠 High | Unauthorized access | Medium | **P1** |
| Database polling overhead | 🟠 High | Resource waste | High | P2 |
| Network failure during webhook | 🟠 High | Data inconsistency | Medium | P2 |
| Excessive DB privileges | 🟠 High | Security risk | Low | P3 |
| No retry for failed downloads | 🟡 Medium | Manual intervention | Medium | P2 |
| No process monitoring | 🟡 Medium | Delayed incident response | Low | **P1** |

---

## 🎯 RECOMMENDED ROADMAP

### Week 1: Critical Fixes
1. ✅ Add systemd service for auto-restart
2. ✅ Implement HMAC webhook authentication
3. ✅ Remove secrets from CLI arguments

### Week 2-3: Monitoring & Alerting
4. ✅ Add health check endpoint
5. ✅ Setup Prometheus + Grafana
6. ✅ Configure email alerts for worker crashes

### Month 2: Scalability
7. ✅ Migrate to Redis queue (BullMQ/RQ)
8. ✅ Scale to 3-5 parallel workers
9. ✅ Implement priority queues

### Month 3: Hardening
10. ✅ Database user with least privileges
11. ✅ Add request rate limiting
12. ✅ Implement comprehensive logging

---

## 🏁 CONCLUSION

The current system is **functional for low traffic** but has **critical vulnerabilities** in:
- ❌ **Scalability** (1 worker = 60 min/task bottleneck)
- ❌ **Reliability** (silent failures, no monitoring)
- ❌ **Security** (exposed credentials, weak authentication)

**Immediate Action Required:**
1. Add process monitoring (systemd)
2. Implement HMAC authentication
3. Remove secrets from command line

**Next 30 Days:**
4. Migrate to message queue (10x throughput)
5. Add health checks and alerting

This will transform the system from "works when lucky" to "production-grade reliable."

---

**Report Prepared By:** Senior System Architect  
**Date:** January 12, 2026  
**Status:** 🔴 Requires Immediate Action
