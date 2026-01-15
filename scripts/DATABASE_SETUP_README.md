# 🗄️ Database Setup Guide

Hướng dẫn tạo lại database sau khi xóa tất cả các bảng.

---

## 📋 Có 2 cách để tạo lại database:

### **Cách 1: Sử dụng SQL Script (RECOMMENDED)**

Tạo database từ file SQL schema - nhanh và an toàn nhất.

```bash
cd /root/project/server
./scripts/setup-database.sh
```

**Hoặc chạy trực tiếp SQL:**

```bash
cd /root/project/server
mysql -u root -p <DB_NAME> < scripts/migrations/create_all_tables.sql
```

**Ví dụ:**
```bash
mysql -u root -p udemy_bot < scripts/migrations/create_all_tables.sql
```

---

### **Cách 2: Sử dụng Sequelize Models**

Tạo database từ Sequelize models (có thể gặp lỗi "Too many keys").

```bash
cd /root/project/server
node scripts/setup-database.js
```

**Lưu ý:** Nếu gặp lỗi "Too many keys specified; max 64 keys allowed", hãy dùng Cách 1.

---

## 📊 Cấu trúc Database

Sau khi setup, bạn sẽ có:

### **Tables:**
1. **orders** - Lưu thông tin đơn hàng
   - `id`, `order_code`, `user_email`, `total_amount`
   - `payment_status`, `order_status`
   - `payment_gateway_data`, `note`

2. **download_tasks** - Lưu thông tin các task download
   - `id`, `order_id`, `email`, `course_url`
   - `status`, `drive_link`, `retry_count`, `error_log`

3. **order_audit_logs** - Lưu log các sự kiện
   - `id`, `order_id`, `task_id`
   - `event_type`, `event_category`, `severity`
   - `message`, `details`, `source`

### **Views:**
- `v_order_latest_events` - Sự kiện mới nhất của mỗi order
- `v_order_errors` - Tóm tắt lỗi theo order

### **Stored Procedures:**
- `sp_log_audit_event` - Thêm log event

---

## ✅ Verification

Sau khi setup, kiểm tra:

```sql
-- Xem tất cả tables
SHOW TABLES;

-- Xem cấu trúc từng table
DESCRIBE orders;
DESCRIBE download_tasks;
DESCRIBE order_audit_logs;

-- Xem indexes
SHOW INDEX FROM orders;
SHOW INDEX FROM download_tasks;
SHOW INDEX FROM order_audit_logs;

-- Test view
SELECT * FROM v_order_latest_events LIMIT 5;

-- Test stored procedure
CALL sp_log_audit_event(
  1,                          -- order_id
  NULL,                       -- task_id
  'order_created',            -- event_type
  'system',                   -- event_category
  'info',                     -- severity
  'Test log entry',           -- message
  '{"test": true}',           -- details
  NULL,                       -- previous_status
  'pending',                  -- new_status
  'test_script'               -- source
);
```

---

## 🔧 Troubleshooting

### **Lỗi: "Too many keys specified"**

**Nguyên nhân:** MySQL giới hạn 64 foreign keys/indexes.

**Giải pháp:** Dùng Cách 1 (SQL script) thay vì Sequelize sync.

### **Lỗi: "Table already exists"**

**Nguyên nhân:** Tables đã tồn tại.

**Giải pháp:** 
```sql
DROP TABLE IF EXISTS order_audit_logs;
DROP TABLE IF EXISTS download_tasks;
DROP TABLE IF EXISTS orders;
```
Sau đó chạy lại setup script.

### **Lỗi: "Access denied"**

**Nguyên nhân:** Sai thông tin database credentials.

**Giải pháp:** Kiểm tra file `.env`:
```
DB_NAME=your_database_name
DB_USER=your_username
DB_PASSWORD=your_password
DB_HOST=localhost
```

---

## 📝 Files

- `scripts/migrations/create_all_tables.sql` - SQL schema đầy đủ
- `scripts/setup-database.js` - Node.js script (Sequelize)
- `scripts/setup-database.sh` - Bash script (SQL)

---

## 🚀 Quick Start

```bash
# 1. Vào thư mục server
cd /root/project/server

# 2. Chạy setup script
./scripts/setup-database.sh

# 3. Verify
mysql -u root -p <DB_NAME> -e "SHOW TABLES;"
```

---

## ⚠️ Lưu ý

- **Backup trước khi chạy:** Script sẽ DROP tất cả tables hiện có
- **Environment variables:** Đảm bảo `.env` file có đầy đủ thông tin DB
- **Permissions:** Đảm bảo user có quyền CREATE, DROP, ALTER
