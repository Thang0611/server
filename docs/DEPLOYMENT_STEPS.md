# 🚀 Hướng Dẫn Triển Khai Worker Mới

**Ngày:** 2026-01-12  
**Mục tiêu:** Deploy worker đã refactor để khắc phục lỗi production

---

## ✅ NHỮNG GÌ ĐÃ ĐƯỢC SỬA

1. ✅ **Webhook "Thiếu secret_key"** - Thêm `secret_key` vào body
2. ✅ **Concurrency Isolation** - Mỗi task có thư mục `Task_{id}` riêng
3. ✅ **Smart Retry** - Resume download thay vì tải lại từ đầu
4. ✅ **NoneType Error** - Fix crash khi API Udemy timeout

Chi tiết xem: `WORKER_REFACTOR_SUMMARY.md`

---

## 📋 BƯỚC TRIỂN KHAI

### Bước 1: Kiểm tra biến môi trường

```bash
# Kiểm tra file .env
cat /root/server/.env | grep -E "(API_SECRET_KEY|UDEMY_TOKEN)"

# Nếu thiếu API_SECRET_KEY, thêm vào:
# (Lấy secret key từ Node.js .env hoặc controller)
echo "API_SECRET_KEY=your_actual_secret_key_here" >> /root/server/.env
```

⚠️ **LƯU Ý:** `API_SECRET_KEY` phải khớp với key trong Node.js server!

### Bước 2: Backup workers cũ (Optional)

```bash
cd /root/server/udemy_dl
cp worker_rq.py worker_rq.py.backup.$(date +%Y%m%d)
cp main.py main.py.backup.$(date +%Y%m%d)
```

### Bước 3: Dừng workers cũ

```bash
cd /root/server
bash stop_workers.sh

# Hoặc dừng thủ công:
pkill -f worker_rq.py

# Xác nhận đã dừng:
pgrep -f worker_rq.py
# (Không có output = đã dừng)
```

### Bước 4: Xóa queue cũ (Optional - nếu cần reset)

```bash
# XÓA toàn bộ queue (CẨNTHẬN!)
# redis-cli DEL rq:queue:downloads

# Hoặc chỉ xem queue:
redis-cli LLEN rq:queue:downloads
redis-cli LRANGE rq:queue:downloads 0 -1
```

### Bước 5: Khởi động workers mới

```bash
cd /root/server
bash start_workers.sh

# Kiểm tra đã chạy:
pgrep -f worker_rq.py | wc -l
# Output: 5 (nếu chạy 5 workers)
```

### Bước 6: Theo dõi log

```bash
# Xem log worker #1
tail -f /root/server/logs/rq_worker_1.log

# Hoặc xem tất cả:
tail -f /root/server/logs/rq_worker_*.log

# Xem log 50 dòng cuối:
tail -50 /root/server/logs/rq_worker_1.log
```

### Bước 7: Test với job mẫu

```bash
# Thêm job test vào queue
redis-cli LPUSH rq:queue:downloads '{
  "taskId": 9999,
  "email": "test@example.com",
  "courseUrl": "https://www.udemy.com/course/test-course/"
}'

# Xem log để check xử lý
tail -f /root/server/logs/rq_worker_1.log
```

**Kết quả mong đợi trong log:**

```
[2026-01-12 16:00:00] [WORKER #1] Received job from rq:queue:downloads
[2026-01-12 16:00:00] [RQ JOB] Processing download job
[2026-01-12 16:00:00] [*] Task ID: 9999
[2026-01-12 16:00:00] [SANDBOX] Task directory: Staging_Download/Task_9999  ← ✅ Mới
[2026-01-12 16:00:00] [ATTEMPT 1/3] Downloading course...
```

---

## 🔍 KIỂM TRA KẾT QUẢ

### 1. Kiểm tra Webhook không còn lỗi

**Log cũ (LỖI):**
```
[API FAIL] Status: 400 - {"success":false,"message":"Thiếu secret_key"}
```

**Log mới (OK):**
```
[API] Calling webhook with HMAC auth: Course_Name
[API] Webhook successful: Course_Name  ← ✅ Status 200
```

### 2. Kiểm tra Task Isolation

```bash
# Xem cấu trúc thư mục
ls -la /root/server/udemy_dl/Staging_Download/

# Output mong đợi:
# Task_777/
# Task_888/
# Task_999/
```

### 3. Kiểm tra Resume (khi có lỗi)

**Log mong đợi:**
```
[ATTEMPT 1/3] Downloading course...
[ERROR] Connection timeout
[RESUME] Keeping downloaded files for resume...  ← ✅ Không xóa file
[INFO] Retrying in 20 seconds...
[ATTEMPT 2/3] Downloading course...
[CHECK] Downloaded: Course_Name (resumed from lecture 50)  ← ✅ Tải tiếp
```

---

## 🐛 TROUBLESHOOTING

### Lỗi: "Thiếu secret_key" vẫn còn

**Nguyên nhân:** `.env` chưa có `API_SECRET_KEY`

**Giải pháp:**
```bash
# Lấy key từ Node.js
grep API_SECRET_KEY /root/server/.env

# Nếu không có, hỏi admin hoặc check Node.js controller
cat /root/server/src/controllers/webhook.controller.js | grep API_SECRET_KEY

# Thêm vào .env
echo "API_SECRET_KEY=actual_key_here" >> /root/server/.env

# Restart workers
bash stop_workers.sh && bash start_workers.sh
```

### Lỗi: Workers không chạy

**Kiểm tra:**
```bash
# Check Redis
redis-cli ping

# Check Python
which python3
python3 --version

# Check permissions
ls -la /root/server/udemy_dl/worker_rq.py

# Check log
tail -50 /root/server/logs/rq_worker_1.log
```

### Lỗi: Download vẫn fail

**Kiểm tra:**
```bash
# Check UDEMY_TOKEN
grep UDEMY_TOKEN /root/server/.env

# Test download thủ công
cd /root/server/udemy_dl
python3 main.py -c "https://www.udemy.com/course/test/" -o /tmp/test

# Check disk space
df -h /root/server/udemy_dl/Staging_Download
```

### Lỗi: MySQL connection failed

**Kiểm tra:**
```bash
# Test MySQL connection
mysql -h $(grep DB_HOST /root/server/.env | cut -d= -f2) \
      -u $(grep DB_USER /root/server/.env | cut -d= -f2) \
      -p$(grep DB_PASSWORD /root/server/.env | cut -d= -f2) \
      -e "SELECT 1;"

# Nếu lỗi, check credentials trong .env
cat /root/server/.env | grep DB_
```

---

## 📊 MONITORING

### Xem queue size

```bash
# Số job đang chờ
redis-cli LLEN rq:queue:downloads

# Xem 10 job đầu (không lấy ra)
redis-cli LRANGE rq:queue:downloads 0 9

# Xem job đang xử lý
ps aux | grep worker_rq.py
```

### Xem worker status

```bash
# Số worker đang chạy
pgrep -f worker_rq.py | wc -l

# Chi tiết processes
ps aux | grep worker_rq.py | grep -v grep

# Memory usage
ps aux | grep worker_rq.py | grep -v grep | awk '{sum+=$6} END {print sum/1024 " MB"}'
```

### Xem disk usage

```bash
# Tổng dung lượng Staging
du -sh /root/server/udemy_dl/Staging_Download/

# Chi tiết từng task
du -sh /root/server/udemy_dl/Staging_Download/Task_*

# Xóa task cũ (> 7 ngày)
find /root/server/udemy_dl/Staging_Download -name "Task_*" -mtime +7 -exec rm -rf {} \;
```

---

## 🧹 MAINTENANCE

### Cleanup định kỳ (Cron job)

Tạo file `/root/cleanup_old_tasks.sh`:

```bash
#!/bin/bash
# Cleanup old failed tasks

LOG_FILE="/root/server/logs/cleanup.log"
STAGING_DIR="/root/server/udemy_dl/Staging_Download"

echo "[$(date)] Starting cleanup..." >> "$LOG_FILE"

# Xóa task cũ hơn 7 ngày
DELETED=$(find "$STAGING_DIR" -name "Task_*" -mtime +7 -type d 2>/dev/null)

if [ -n "$DELETED" ]; then
    echo "$DELETED" | while read dir; do
        echo "  Removing: $dir" >> "$LOG_FILE"
        rm -rf "$dir"
    done
else
    echo "  No old tasks to clean" >> "$LOG_FILE"
fi

echo "[$(date)] Cleanup finished" >> "$LOG_FILE"
```

Thêm vào crontab:
```bash
chmod +x /root/cleanup_old_tasks.sh
crontab -e

# Thêm dòng này (chạy hàng ngày lúc 3h sáng):
0 3 * * * /root/cleanup_old_tasks.sh
```

---

## 📚 TÀI LIỆU THAM KHẢO

- **Chi tiết refactor:** `WORKER_REFACTOR_SUMMARY.md`
- **Architecture:** `PHASE2_README.md`
- **Queue operations:** `QUEUE_OPERATIONS.md`
- **Quick reference:** `PHASE2_QUICK_REFERENCE.md`

---

## ✅ CHECKLIST TRIỂN KHAI

- [ ] Đã thêm `API_SECRET_KEY` vào `.env`
- [ ] Đã dừng workers cũ
- [ ] Đã khởi động workers mới
- [ ] Đã kiểm tra log không có lỗi
- [ ] Đã test với job mẫu
- [ ] Webhook trả về 200 (không còn 400)
- [ ] Thư mục `Task_*` được tạo đúng
- [ ] Resume hoạt động khi retry
- [ ] Đã setup cleanup cron job

---

## 🎉 HOÀN TẤT!

Nếu tất cả checklist đã ✅, hệ thống worker mới đã sẵn sàng production!

**Liên hệ:** Nếu gặp vấn đề, check log tại `/root/server/logs/rq_worker_*.log`
