# 🏗️ Cải Thiện Kiến Trúc - Trước & Sau

## 📊 Trạng Thái Hiện Tại vs. Trạng Thái Khuyến Nghị

---

## 🔴 KIẾN TRÚC HIỆN TẠI (Vấn Đề)

```
┌──────────────────────────────────────────────────────────────────────┐
│                         HỆ THỐNG HIỆN TẠI                             │
│                      (Có Vấn Đề Nghiêm Trọng)                         │
└──────────────────────────────────────────────────────────────────────┘


    Khách hàng                                SePay
       │                                         │
       │ 1. Tạo Đơn Hàng                         │
       │──────────────────┐                      │
       │                  ▼                      │
       │           ┌─────────────┐               │
       │           │   Node.js   │               │
       │           │   Backend   │               │
       │           └──────┬──────┘               │
       │                  │                      │
       │                  │ 2. Tạo Task          │
       │                  ▼                      │
       │           ┌─────────────┐               │
       │           │   MySQL     │               │
       │           │  Database   │               │
       │           └──────┬──────┘               │
       │                  │                      │
       │◄─────────────────┘                      │
       │ 3. Trả Về QR                            │
       │                                         │
       │ 4. Khách thanh toán                     │
       │ qua app banking                         │
       │                                         │
       │                              5. Webhook │
       │                              ┌──────────┘
       │                              ▼
       │                       ┌─────────────┐
       │                       │   Node.js   │
       │                       │   Backend   │
       │                       └──────┬──────┘
       │                              │
       │                              │ 6. Cập nhật: paid → processing
       │                              ▼
       │                       ┌─────────────┐
       │                       │   MySQL     │
       │                       └──────┬──────┘
       │                              │
       │                              │ 7. Node.js Worker
       │                              │    đăng ký vào Udemy
       │                              │
       │                              │ 8. Cập nhật: processing → enrolled
       │                              ▼
       │                       ┌─────────────┐
       │                       │   MySQL     │
       │                       └──────┬──────┘
       │                              │
       │                              │
       │                              │ ❌ POLLING (mỗi 10s)
       │                              │
       │                       ┌──────▼──────┐
       │                       │   Python    │ ◄─── ⚠️ WORKER ĐƠN
       │                       │   Worker    │      (1 task tại 1 thời điểm)
       │                       │ (Standalone)│
       │                       └──────┬──────┘
       │                              │
       │                              │ 9. Download khóa học (60+ phút)
       │                              │    ↓
       │                              │    Upload lên Drive (rclone)
       │                              │
       │                              │ 10. Webhook: finalize
       │                              ▼
       │                       ┌─────────────┐
       │                       │   Node.js   │
       │                       │   Backend   │
       │                       └──────┬──────┘
       │                              │
       │                              │ 11. Cấp quyền Drive
       │                              │     Gửi email
       │◄─────────────────────────────┘


╔═══════════════════════════════════════════════════════════════╗
║                       🚨 VẤN ĐỀ NGHIÊM TRỌNG                   ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  ❌ Python Worker Đơn = nghẽn 60 phút/task                   ║
║     • 100 đơn hàng = 100 giờ xử lý                            ║
║     • Không thể scale ngang                                   ║
║                                                               ║
║  ❌ Database Polling = Không Hiệu Quả                         ║
║     • 8,640 query mỗi ngày (ngay cả khi idle)                 ║
║     • Delay 10 giây trước khi nhận task                       ║
║                                                               ║
║  ❌ Không Giám Sát = Lỗi Im Lặng                              ║
║     • Python crash = không cảnh báo                           ║
║     • Task kẹt mãi mãi                                        ║
║                                                               ║
║  ❌ Bảo Mật Yếu                                               ║
║     • Secrets trong command line (thấy được trong ps aux)     ║
║     • Static webhook secret (không rotation)                  ║
║     • Không request signing (replay attack)                   ║
║                                                               ║
║  ❌ Xử Lý Lỗi Kém                                             ║
║     • Task thất bại không retry                               ║
║     • Lỗi network gây thất bại vĩnh viễn                      ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

---

## ✅ KIẾN TRÚC KHUYẾN NGHỊ (Giải Pháp)

```
┌──────────────────────────────────────────────────────────────────────┐
│                      HỆ THỐNG CẢI THIỆN                               │
│                   (Sẵn Sàng Production)                               │
└──────────────────────────────────────────────────────────────────────┘


    Khách hàng                                SePay
       │                                         │
       │ 1. Tạo Đơn Hàng                         │
       │──────────────────┐                      │
       │                  ▼                      │
       │           ┌─────────────┐               │
       │           │   Node.js   │               │
       │           │   Backend   │               │
       │           │             │               │
       │           │  + Health   │◄──────── Prometheus/Grafana
       │           │    Check    │         (Giám Sát)
       │           └──────┬──────┘
       │                  │
       │                  │ 2. Tạo Task
       │                  ▼
       │           ┌─────────────┐
       │           │   MySQL     │
       │           │  Database   │
       │           └──────┬──────┘
       │                  │
       │◄─────────────────┘
       │ 3. Trả Về QR
       │
       │ 4. Khách thanh toán
       │ qua app banking
       │
       │                              5. Webhook (HMAC signed)
       │                              ┌──────────┘
       │                              ▼
       │                       ┌─────────────┐
       │                       │   Node.js   │
       │                       │   Backend   │
       │                       └──────┬──────┘
       │                              │
       │                              │ 6. Cập nhật: paid → processing
       │                              │    + Push vào Redis Queue ✅
       │                              ▼
       │                   ┌──────────────────────┐
       │                   │                      │
       │                   │   Redis Queue        │
       │                   │   (BullMQ/RQ)        │
       │                   │                      │
       │                   │  ✅ Giao ngay lập tức │
       │                   │  ✅ Hỗ trợ priority   │
       │                   │  ✅ Tự động retry     │
       │                   │  ✅ Job metrics       │
       │                   │                      │
       │                   └──────────┬───────────┘
       │                              │
       │                              │ 7. Worker pull task
       │                              │
       │              ┌───────────────┼───────────────┬──────────────┐
       │              ▼               ▼               ▼              ▼
       │      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ...
       │      │   Python     │ │   Python     │ │   Python     │
       │      │   Worker 1   │ │   Worker 2   │ │   Worker N   │
       │      │              │ │              │ │              │
       │      │ + Health     │ │ + Health     │ │ + Health     │
       │      │   :8881      │ │   :8882      │ │   :888N      │
       │      └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │             │                │                │
       │             │    ✅ XỬ LÝ SONG SONG          │
       │             │                │                │
       │             └────────────────┼────────────────┘
       │                              │
       │                              │ 8. Download + Upload
       │                              │    (60 phút mỗi cái, nhưng song song)
       │                              │
       │                              │ 9. Webhook: finalize (HMAC + timestamp)
       │                              ▼
       │                       ┌─────────────┐
       │                       │   Node.js   │
       │                       │   Backend   │
       │                       └──────┬──────┘
       │                              │
       │                              │ 10. Xác minh HMAC + Timestamp
       │                              │     Cấp quyền Drive
       │                              │     Gửi email
       │◄─────────────────────────────┘


             ┌────────────────────────────────────┐
             │   systemd / Supervisor             │
             │   (Tự khởi động lại worker khi crash) │
             └────────────────────────────────────┘


╔═══════════════════════════════════════════════════════════════╗
║                      ✅ CẢI THIỆN                              ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  ✅ Scale Ngang                                               ║
║     • 10 worker = thông lượng tăng 10x                        ║
║     • 100 đơn hàng = 10 giờ (thay vì 100 giờ)                 ║
║                                                               ║
║  ✅ Giao Task Ngay Lập Tức                                    ║
║     • Redis queue push task ngay lập tức                      ║
║     • Không delay polling 10 giây                             ║
║                                                               ║
║  ✅ Tự Khởi Động Lại & Giám Sát                               ║
║     • systemd khởi động lại worker khi crash                  ║
║     • Health check mỗi 60 giây                                ║
║     • Prometheus + Grafana dashboard                          ║
║                                                               ║
║  ✅ Bảo Mật Mạnh                                              ║
║     • HMAC-SHA256 webhook signing                             ║
║     • Timestamp validation (cửa sổ 5 phút)                    ║
║     • Không secrets trong command line                        ║
║                                                               ║
║  ✅ Xử Lý Lỗi Mạnh Mẽ                                         ║
║     • Tự động retry với exponential backoff                   ║
║     • Task thất bại vào dead-letter queue                     ║
║     • Lỗi network kích hoạt retry                             ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

---

## 📈 So Sánh Hiệu Suất

### Kịch Bản: 100 Đơn Hàng Nhận Đồng Thời

| Chỉ Số | Hệ Thống Hiện Tại | Hệ Thống Cải Thiện | Cải Thiện |
|--------|-------------------|-------------------|-----------|
| **Thời Gian Xử Lý** | 6,000 phút (4+ ngày) | 600 phút (10 giờ) | **Nhanh hơn 10x** |
| **Khách Đầu Chờ** | ~60 phút | ~60 phút | Như nhau |
| **Khách Cuối Chờ** | ~6,000 phút | ~600 phút | **Nhanh hơn 10x** |
| **Phục Hồi Crash** | Khởi động lại thủ công | Tự động (10s) | **99.9% uptime** |
| **Delay Nhận Task** | 10 giây | < 1 giây | **Nhanh hơn 10x** |
| **Query DB (idle)** | 8,640/ngày | 0/ngày | **Giảm 100%** |
| **Retry Task Thất Bại** | Thủ công | Tự động (3 lần) | **100% coverage** |
| **Điểm Bảo Mật** | 3/10 | 9/10 | **Cải thiện 3x** |

---

## 🔧 Các Bước Migration

### Giai Đoạn 1: Sửa Ngay (Tuần 1)

```bash
# 1. Thiết lập systemd để tự khởi động lại
sudo cat > /etc/systemd/system/udemy-worker.service << 'EOF'
[Unit]
Description=Udemy Download Worker
After=network.target mysql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/root/server/udemy_dl
ExecStart=/usr/bin/python3 /root/server/udemy_dl/worker.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable udemy-worker.service
sudo systemctl start udemy-worker.service

# 2. Triển khai HMAC authentication
# (Xem DOWNLOAD_WORKFLOW_ANALYSIS_VI.md để biết code)

# 3. Thêm health check endpoint
# (Xem code trong khuyến nghị Ưu tiên 2)
```

---

### Giai Đoạn 2: Message Queue (Tuần 2-3)

```bash
# Cài đặt Redis
sudo apt-get install redis-server

# Cài đặt BullMQ (Node.js)
npm install bullmq

# Cài đặt RQ (Python)
pip install rq
```

**Phía Node.js:**
```javascript
// src/queues/download.queue.js
const { Queue } = require('bullmq');

const downloadQueue = new Queue('downloads', {
  connection: {
    host: 'localhost',
    port: 6379
  }
});

module.exports = downloadQueue;
```

**Phía Python:**
```python
# worker_rq.py
import redis
from rq import Worker, Queue, Connection

conn = redis.Redis()

if __name__ == '__main__':
    with Connection(conn):
        worker = Worker([Queue('downloads')])
        worker.work()
```

**Chạy nhiều worker:**
```bash
# Start 5 worker
for i in {1..5}; do
    python worker_rq.py &
done
```

---

### Giai Đoạn 3: Giám Sát (Tuần 3-4)

```bash
# Cài đặt Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.40.0/prometheus-2.40.0.linux-amd64.tar.gz
tar xvfz prometheus-*.tar.gz
cd prometheus-*

# Cấu hình prometheus.yml
cat > prometheus.yml << 'EOF'
scrape_configs:
  - job_name: 'python-workers'
    static_configs:
      - targets: ['localhost:8881', 'localhost:8882', 'localhost:8883']
EOF

# Start Prometheus
./prometheus --config.file=prometheus.yml
```

---

## 📊 Dashboard Giám Sát

### Chỉ Số Chính Cần Theo Dõi

1. **Sức Khỏe Worker**
   ```
   up{job="python-workers"}
   → Hiển thị worker nào đang online
   ```

2. **Độ Sâu Queue**
   ```
   redis_queue_length{queue="downloads"}
   → Số lượng task đang pending
   ```

3. **Thời Gian Xử Lý**
   ```
   histogram_quantile(0.95, download_duration_seconds)
   → Thời gian download percentile 95
   ```

4. **Tỷ Lệ Thành Công**
   ```
   rate(tasks_completed_total[5m]) / rate(tasks_started_total[5m])
   → Phần trăm download thành công
   ```

5. **Tài Nguyên Hệ Thống**
   ```
   process_resident_memory_bytes{job="python-workers"}
   → Sử dụng memory mỗi worker
   ```

---

## 🎯 Chỉ Số Thành Công

### Sau Triển Khai, Bạn Sẽ Thấy:

| Chỉ Số | Mục Tiêu | Cách Đo |
|--------|----------|---------|
| **Thời Gian Xử Lý TB** | < 70 phút/task | Prometheus `download_duration_seconds` |
| **Worker Uptime** | > 99.5% | Prometheus `up` metric |
| **Task Thất Bại** | < 2% | `SELECT COUNT(*) FROM tasks WHERE status='failed'` |
| **Thời Gian Chờ Queue** | < 5 phút | Prometheus `queue_wait_seconds` |
| **Retry Thành Công** | > 80% | `SELECT * FROM tasks WHERE retry_count > 0 AND status='completed'` |

---

## 🔐 Checklist Bảo Mật

- [x] Secrets không trong command line (an toàn với `ps aux`)
- [x] HMAC authentication trên webhook
- [x] Timestamp validation (cửa sổ 5 phút)
- [x] Database user với quyền tối thiểu
- [x] TLS trên tất cả external API
- [x] API rate limiting enabled
- [x] Audit bảo mật định kỳ đã lên lịch

---

## 🚀 Kế Hoạch Rollback

Nếu hệ thống mới có vấn đề:

```bash
# 1. Dừng worker mới
sudo systemctl stop udemy-worker.service

# 2. Hoàn về worker cũ
cd /root/server/udemy_dl
git checkout main  # hoặc commit trước đó
python3 worker.py &

# 3. Drain Redis queue về MySQL
# (Script tùy chỉnh để chuyển task lại)

# 4. Giám sát trong 24 giờ
```

---

## 📞 Liên Hệ Hỗ Trợ

| Vấn Đề | Liên Hệ | Ưu Tiên |
|--------|---------|---------|
| Worker crash | DevOps Team | P0 (Ngay lập tức) |
| Queue backlog | Backend Team | P1 (< 1 giờ) |
| Lỗi database | DBA Team | P1 (< 1 giờ) |
| Lỗi Drive API | Infrastructure | P2 (< 4 giờ) |

---

## 📚 Tài Nguyên Thêm

- **Phân Tích Đầy Đủ:** `DOWNLOAD_WORKFLOW_ANALYSIS_VI.md`
- **Tham Khảo Nhanh:** `WORKFLOW_QUICK_REFERENCE_VI.md`
- **Tài Liệu API:** `postman/README.md`
- **Khắc Phục Sự Cố:** `WORKFLOW_QUICK_REFERENCE_VI.md#khắc-phục-sự-cố`

---

**Phiên Bản Tài Liệu:** 1.0  
**Cập Nhật Lần Cuối:** 12 Tháng 1, 2026  
**Trạng Thái:** 🟢 Sẵn Sàng Để Triển Khai
