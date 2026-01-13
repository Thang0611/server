# Hướng Dẫn Vận Hành Queue - Hệ Thống Redis Queue (Giai đoạn 2)

> **Dành cho người vận hành mới làm quen với message queue**  
> Tài liệu này giải thích cách hệ thống download hoạt động và cách quản lý nó.

---

## 📚 Mục Lục

1. [Message Queue là gì?](#message-queue-là-gì)
2. [Hệ thống hoạt động như thế nào](#hệ-thống-hoạt-động-như-thế-nào)
3. [Tại sao dùng Queue](#tại-sao-dùng-queue)
4. [Bảng Lệnh Nhanh](#bảng-lệnh-nhanh)
5. [Vận Hành Hàng Ngày](#vận-hành-hàng-ngày)
6. [Xử Lý Sự Cố](#xử-lý-sự-cố)
7. [Các Tình Huống Thường Gặp](#các-tình-huống-thường-gặp)

---

## 🎓 Message Queue là gì?

Hãy nghĩ về Message Queue như một **hộp thư bưu điện**:

- **Hệ thống thanh toán (Node.js)** = Người bỏ thư vào hộp
- **Redis Queue** = Hộp thư (lưu trữ thư an toàn)
- **Python Workers** = Nhân viên bưu điện lấy thư và giao hàng

**Ví dụ đơn giản:**
```
Khách hàng thanh toán
    ↓
Hệ thống thanh toán bỏ "yêu cầu download" vào hộp thư (Redis)
    ↓
Python Worker kiểm tra hộp thư, tìm thấy yêu cầu
    ↓
Worker download khóa học và giao cho khách
```

---

## 🔄 Hệ Thống Hoạt Động Như Thế Nào

### Sơ Đồ Luồng Dữ Liệu

```
┌─────────────────────────────────────────────────────────────────┐
│                  WEBHOOK THANH TOÁN ĐẾN                         │
│  Khách chuyển tiền, SePay thông báo cho server của chúng ta    │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────┐
         │   PAYMENT SERVICE       │
         │   (Node.js)             │
         │                         │
         │  1. Xác minh thanh toán │
         │  2. Cập nhật database:  │
         │     status='processing' │
         │  3. Đẩy vào Redis queue │
         └────────┬────────────────┘
                  │
                  │ addDownloadJob({
                  │   taskId: 123,
                  │   email: "user@example.com",
                  │   courseUrl: "https://..."
                  │ })
                  │
                  ▼
         ┌─────────────────────────┐
         │   REDIS QUEUE           │
         │   (Message Broker)      │
         │                         │
         │  Queue: rq:queue:       │
         │         downloads       │
         │                         │
         │  [Job 1] [Job 2] [Job 3]│
         └────────┬────────────────┘
                  │
                  │ Workers lấy job từ queue
                  │ (BRPOP - blocking pop)
                  │
         ┌────────┴────────────────────────────┐
         │                                     │
    ┌────▼────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
    │Worker #1│  │Worker #2│  │Worker #3│  │Worker #4│  │Worker #5│
    │ Python  │  │ Python  │  │ Python  │  │ Python  │  │ Python  │
    │         │  │         │  │         │  │         │  │         │
    │ [Rảnh]  │  │[Đang làm]│ │ [Rảnh]  │  │ [Rảnh]  │  │ [Rảnh]  │
    └────┬────┘  └────┬────┘  └─────────┘  └─────────┘  └─────────┘
         │            │
         │            └─> Download khóa học
         │                Upload lên Google Drive
         │                Cập nhật database: status='completed'
         │                Gửi email thông báo
         │
         └─> Sẵn sàng xử lý job tiếp theo
```

Xem tài liệu đầy đủ tại: /root/server/PHASE2_README.md


### Quy Trình Chi Tiết (10 Bước)

1. **Khách hàng thanh toán** → Cổng thanh toán (SePay) gửi webhook đến server
2. **Xác minh thanh toán** → Node.js kiểm tra số tiền và mã đơn hàng
3. **Cập nhật Database** → Trạng thái đơn = 'paid', Task = 'processing'
4. **Đẩy Job vào Queue** → Chi tiết task được gửi vào Redis queue
5. **Worker nhận Job** → Python worker lấy job từ queue (tức thì, không delay)
6. **Bắt đầu Download** → Worker download khóa học bằng tài khoản Udemy
7. **Upload lên Drive** → Khóa học được upload lên Google Drive qua rclone
8. **Cập nhật Database** → Trạng thái task = 'completed'
9. **Gửi Email** → Khách hàng nhận link download
10. **Worker sẵn sàng** → Worker chờ job tiếp theo

---

## ✨ Tại Sao Dùng Queue (So với Hệ Thống Cũ)

### So Sánh Hiệu Năng

| Chỉ số | Cũ (Polling) | Mới (Queue) | Cải thiện |
|--------|--------------|-------------|-----------|
| Độ trễ xử lý | 5-10 giây | < 1 giây | **Nhanh hơn 10 lần** |
| Truy vấn DB/ngày | 8,640 | ~100 | **Giảm 99%** |
| Xử lý đồng thời | 1 | 5 | **Tăng 5 lần** |
| Sử dụng CPU | Cao (polling liên tục) | Thấp (sự kiện) | **Giảm 80%** |
| Khả năng mở rộng | Khó (1 server) | Dễ (N workers) | **Không giới hạn** |

**Lợi ích:**
- ✅ **Xử lý tức thì** - Không chờ đợi, không polling
- ✅ **Mở rộng dễ dàng** - 5 workers xử lý 5 khóa học cùng lúc
- ✅ **Đáng tin cậy** - Job được lưu trong Redis ngay cả khi worker restart
- ✅ **Hiệu quả** - Giảm 99% truy vấn database
- ✅ **Dễ giám sát** - Dễ dàng theo dõi kích thước queue và trạng thái worker

---

## 🎮 Bảng Lệnh Nhanh

### Kiểm Tra Sức Khỏe Hệ Thống

```bash
# Kiểm tra Redis có chạy không
redis-cli ping
# Kết quả mong đợi: PONG

# Kiểm tra Python workers có chạy không (phải có 5)
ps aux | grep worker_rq.py | grep -v grep | wc -l

# Kiểm tra trạng thái service
sudo systemctl status udemy-worker-rq

# Kiểm tra có bao nhiêu job đang chờ trong queue
redis-cli LLEN rq:queue:downloads
# Kết quả mong đợi: 0 hoặc số nhỏ
```

### Giám Sát Workers

```bash
# Xem log trực tiếp từ tất cả workers
tail -f /root/server/logs/rq_worker_*.log

# Xem log từ worker cụ thể
tail -f /root/server/logs/rq_worker_1.log

# Xem worker nào đang làm gì
for i in {1..5}; do 
  echo "=== Worker $i ===" 
  tail -3 /root/server/logs/rq_worker_$i.log
done
```

### Khởi Động Lại Workers

```bash
# Khởi động lại bằng systemd (khuyến nghị)
sudo systemctl restart udemy-worker-rq

# Xác minh workers đã khởi động
sleep 3
ps aux | grep worker_rq.py | grep -v grep | wc -l
# Kết quả mong đợi: 5
```

---

## 🔧 Xử Lý Sự Cố

### Vấn đề 1: "Khách đã thanh toán nhưng không nhận được khóa học"

**Các bước chẩn đoán:**

1. **Kiểm tra trạng thái task trong database:**
```bash
mysql -u root -p -e "
SELECT id, course_url, status, updated_at
FROM download_tasks 
WHERE email = 'email_khach_hang@gmail.com'
ORDER BY created_at DESC 
LIMIT 5;
"
```

2. **Giải thích các trạng thái:**

| Trạng thái | Ý nghĩa | Cần làm gì |
|------------|---------|------------|
| `paid` | Chưa được đẩy vào queue | Đẩy vào queue thủ công |
| `processing` | Đang trong queue hoặc đang download | Kiểm tra log worker |
| `failed` | Download thất bại | Kiểm tra log, thử lại |
| `completed` | Đã xong | Kiểm tra log email |

**Giải pháp A: Đẩy vào queue thủ công (nếu status = 'paid' hoặc 'failed'):**

```bash
cd /root/server
node -e "
const { addDownloadJob } = require('./src/queues/download.queue');
addDownloadJob({
  taskId: ID_TASK_Ở_ĐÂY,
  email: 'email_khach_hang@gmail.com',
  courseUrl: 'URL_KHOA_HOC_Ở_ĐÂY'
}).then(() => {
  console.log('✅ Đã đẩy vào queue');
  process.exit(0);
});
"
```

**Giải pháp B: Kiểm tra log worker để tìm lỗi:**

```bash
# Tìm worker nào đã xử lý task này
grep -r "Task ID: ID_TASK" /root/server/logs/rq_worker_*.log
```

---

### Vấn đề 2: "Queue đang tắc nghẽn"

**Triệu chứng:** `redis-cli LLEN rq:queue:downloads` hiển thị số lớn (>10)

**Chẩn đoán:**
```bash
# Kiểm tra kích thước queue
redis-cli LLEN rq:queue:downloads

# Kiểm tra workers có chạy không
ps aux | grep worker_rq.py | grep -v grep | wc -l
# Kết quả mong đợi: 5
```

**Giải pháp:**

**A. Workers đã dừng:**
```bash
sudo systemctl restart udemy-worker-rq
```

**B. Thêm workers tạm thời:**
```bash
cd /root/server/udemy_dl
for i in {6..10}; do
  nohup python3 worker_rq.py $i > /root/server/logs/rq_worker_$i.log 2>&1 &
done
```

---

### Vấn đề 3: "Redis bị tắt"

**Chẩn đoán:**
```bash
redis-cli ping
# Nếu báo lỗi, Redis đã tắt
```

**Giải pháp:**
```bash
sudo systemctl start redis
redis-cli ping  # Phải trả về PONG

# Nếu workers cũng dừng, khởi động lại chúng
sudo systemctl restart udemy-worker-rq
```

---

## 🎯 Các Tình Huống Thường Gặp

### Tình huống 1: Đẩy Task vào Queue thủ công

```bash
# Bước 1: Lấy thông tin task từ database
mysql -u root -p -e "
SELECT id, email, course_url 
FROM download_tasks 
WHERE id = ID_TASK_CỦA_BẠN;
"

# Bước 2: Đẩy vào queue
cd /root/server
node -e "
const { addDownloadJob } = require('./src/queues/download.queue');
addDownloadJob({
  taskId: ID_TASK_CỦA_BẠN,
  email: 'EMAIL_TỪ_DB',
  courseUrl: 'URL_TỪ_DB'
}).then(() => console.log('✅ Đã vào queue')).catch(err => console.error(err));
"

# Bước 3: Theo dõi tiến trình
tail -f /root/server/logs/rq_worker_*.log | grep "Task ID: ID_TASK_CỦA_BẠN"
```

---

### Tình huống 2: Khởi động lại toàn bộ hệ thống

```bash
# Bước 1: Dừng workers
sudo systemctl stop udemy-worker-rq

# Bước 2: Kiểm tra Redis
redis-cli ping
# Nếu không PONG: sudo systemctl start redis

# Bước 3: Khởi động workers
sudo systemctl start udemy-worker-rq

# Bước 4: Xác minh
ps aux | grep worker_rq.py | grep -v grep | wc -l  # Phải là 5
redis-cli LLEN rq:queue:downloads  # Kiểm tra queue
```

---

### Tình huống 3: Tăng số workers khi lượng truy cập cao

```bash
# Thêm 5 workers nữa (tổng cộng 10)
cd /root/server/udemy_dl
for i in {6..10}; do
  nohup python3 worker_rq.py $i > /root/server/logs/rq_worker_$i.log 2>&1 &
done

# Xác minh
ps aux | grep worker_rq.py | grep -v grep | wc -l
```

---

## 📊 Script Giám Sát

Tạo file `/root/server/monitor.sh`:

```bash
#!/bin/bash
clear
echo "═══════════════════════════════════════"
echo "    BẢNG GIÁM SÁT QUEUE"
echo "═══════════════════════════════════════"
echo ""
echo "Redis:    $(redis-cli ping 2>/dev/null || echo 'TẮT')"
echo "Workers:  $(ps aux | grep worker_rq.py | grep -v grep | wc -l)/5"
echo "Queue:    $(redis-cli LLEN rq:queue:downloads) job đang chờ"
echo ""
echo "Cập nhật lúc: $(date '+%H:%M:%S')"
```

**Sử dụng:**
```bash
chmod +x /root/server/monitor.sh
watch -n 5 ./monitor.sh  # Tự động làm mới mỗi 5 giây
```

---

## ✅ Checklist Hàng Ngày

```
[ ] Redis đang chạy (redis-cli ping = PONG)
[ ] 5 workers đang chạy
[ ] Queue trống hoặc ít job (<10)
[ ] Không có lỗi trong log
[ ] Dung lượng ổ đĩa >20%
```

---

## 📚 Tài Liệu Bổ Sung

- **Tài liệu đầy đủ:** `/root/server/PHASE2_README.md`
- **Hướng dẫn triển khai:** `/root/server/PHASE2_DEPLOYMENT_GUIDE.md`
- **Tham khảo nhanh:** `/root/server/PHASE2_QUICK_REFERENCE.md`
- **Code Worker:** `/root/server/udemy_dl/worker_rq.py`
- **Code Queue:** `/root/server/src/queues/download.queue.js`

---

**Cập nhật lần cuối:** 12 Tháng 1, 2026  
**Phiên bản:** Giai đoạn 2 - Hệ thống Redis Queue  
**Hỗ trợ:** Kiểm tra log trước, sau đó báo cáo nếu cần
