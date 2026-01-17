# Task Recovery Service - Hướng Dẫn Khôi Phục Tasks Bị Kẹt

## 🎯 Mục đích

Khi server bị restart đột ngột, các DownloadTask đang ở trạng thái `processing` hoặc `enrolled` có thể bị "treo" vì:
- Task đã được đánh dấu là `processing` hoặc `enrolled` trong database
- Nhưng không còn trong Redis queue (queue bị mất khi server restart)
- Worker không thể tiếp tục xử lý vì không có job trong queue

**Task Recovery Service** tự động khôi phục các task này khi server khởi động lại.

## 🔄 Cơ chế hoạt động

### Auto-Recovery (Tự động)

Khi server khởi động:
1. Sau 5 giây (để đảm bảo các service đã sẵn sàng)
2. Service tự động quét database tìm các task bị kẹt:
   - Status: `processing`, `enrolled`, hoặc `pending`
   - Có `order_id` (không phải orphaned tasks)
   - Không có trong Redis queue
3. Xử lý theo từng loại:
   - **`processing`**: Re-enroll → chuyển thành `enrolled` → queue
   - **`enrolled`**: Queue trực tiếp (đã enroll rồi)
   - **`pending`**: Kiểm tra order đã paid chưa → nếu có thì process

### Manual Recovery (Thủ công qua Admin API)

Admin có thể trigger recovery thủ công qua API:

#### 1. Recover tất cả stuck tasks (system-wide)
```bash
POST /api/admin/tasks/recover
Content-Type: application/json

{
  "maxTasks": 100  # optional, default: 100
}
```

**Response:**
```json
{
  "success": true,
  "message": "Recovered 5 task(s), 0 failed, 2 already in queue",
  "data": {
    "recovered": 5,
    "failed": 0,
    "skipped": 2,
    "totalChecked": 7,
    "totalStuck": 5,
    "breakdown": {
      "processing": 3,
      "enrolled": 2,
      "pending": 0
    }
  }
}
```

#### 2. Recover tasks cho một order cụ thể
```bash
POST /api/admin/orders/:id/recover
```

**Response:**
```json
{
  "success": true,
  "message": "Recovered 2 task(s) for order DH000035",
  "data": {
    "orderId": 35,
    "orderCode": "DH000035",
    "recovered": 2,
    "failed": 0,
    "totalStuck": 2
  }
}
```

## ⚙️ Cấu hình

### Environment Variables

Trong file `.env`:

```bash
# Enable/disable auto-recovery on server startup
# Default: enabled (true)
ENABLE_AUTO_RECOVERY=true

# Maximum number of tasks to recover per auto-recovery run
# Default: 100
MAX_RECOVERY_TASKS=100
```

### Tắt Auto-Recovery

Nếu không muốn auto-recovery chạy tự động:
```bash
ENABLE_AUTO_RECOVERY=false
```

## 📊 Monitoring

### Logs

Service log tất cả hoạt động recovery:

```
[TaskRecovery] Starting stuck task recovery...
[TaskRecovery] Found jobs in queue { count: 3 }
[TaskRecovery] Found potentially stuck tasks { count: 10 }
[TaskRecovery] Tasks confirmed stuck (not in queue) { count: 7 }
[TaskRecovery] Task breakdown { processing: 5, enrolled: 2, pending: 0 }
[TaskRecovery] Re-enrolling processing task { taskId: 123, orderId: 35 }
[TaskRecovery] Task re-enrolled successfully { taskId: 123 }
[TaskRecovery] Re-queuing enrolled task { taskId: 124 }
[TaskRecovery] Task re-queued successfully { taskId: 124 }
[TaskRecovery] Recovery completed { recovered: 7, failed: 0, ... }
```

### Dashboard

Check recovery status qua dashboard stats hoặc order details API.

## 🛠️ Troubleshooting

### Vấn đề: Auto-recovery không chạy

**Kiểm tra:**
1. `ENABLE_AUTO_RECOVERY` có được set = `true` không?
2. Xem server logs khi startup
3. Redis connection có OK không?

### Vấn đề: Recovery failed

**Nguyên nhân thường gặp:**
- Redis không kết nối được → Check Redis service
- Enrollment API failed → Check Udemy cookie/credentials
- Queue full → Check worker processes

**Giải pháp:**
- Check logs để xem lỗi cụ thể
- Retry manual recovery qua API
- Check Redis và worker status

### Vấn đề: Tasks vẫn bị kẹt sau recovery

**Kiểm tra:**
1. Task có trong Redis queue không?
   ```bash
   # Check queue
   redis-cli LRANGE rq:queue:downloads 0 -1
   ```

2. Worker có đang chạy không?
   ```bash
   pm2 status workers
   ```

3. Task status trong DB?
   ```sql
   SELECT id, status, order_id FROM download_tasks 
   WHERE status IN ('processing', 'enrolled') 
   AND order_id IS NOT NULL;
   ```

## 📝 Best Practices

1. **Monitor logs**: Theo dõi recovery logs để phát hiện patterns
2. **Set limits**: Dùng `MAX_RECOVERY_TASKS` để tránh overload
3. **Manual trigger**: Nếu thấy nhiều stuck tasks, trigger manual recovery thay vì chờ auto-recovery
4. **Check order status**: Chỉ recover tasks của orders đã `paid`

## 🔗 Related Files

- Service: `/server/src/services/taskRecovery.service.js`
- Controller: `/server/src/controllers/admin.controller.js`
- Routes: `/server/src/routes/admin.routes.js`
- Server startup: `/server/server.js`

## 📈 Metrics

Recovery service track các metrics:
- `recovered`: Số task đã recover thành công
- `failed`: Số task recover thất bại
- `skipped`: Số task đã có trong queue (skip)
- `totalChecked`: Tổng số task đã check
- `totalStuck`: Tổng số task thực sự bị stuck

---

**Lưu ý:** Recovery service được thiết kế để an toàn và không gây duplicate jobs. Nó kiểm tra queue trước khi re-queue tasks.
