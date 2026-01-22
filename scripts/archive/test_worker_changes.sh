#!/bin/bash
# Script kiểm tra các thay đổi Worker mới
# Created: 2026-01-12

set -e

echo "=========================================="
echo "  KIỂM TRA WORKER REFACTOR"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Check Python files syntax
echo "📝 [1/6] Kiểm tra cú pháp Python..."
cd /root/server/udemy_dl
if python3 -m py_compile worker_rq.py main.py; then
    echo -e "${GREEN}✅ Python syntax OK${NC}"
else
    echo -e "${RED}❌ Python syntax ERROR${NC}"
    exit 1
fi
echo ""

# 2. Check environment variables
echo "🔐 [2/6] Kiểm tra biến môi trường..."
cd /root/server
if grep -q "API_SECRET_KEY" .env; then
    echo -e "${GREEN}✅ API_SECRET_KEY tồn tại${NC}"
else
    echo -e "${YELLOW}⚠️  API_SECRET_KEY chưa có trong .env${NC}"
    echo "   Thêm bằng: echo 'API_SECRET_KEY=your_key' >> .env"
fi

if grep -q "UDEMY_TOKEN" .env; then
    echo -e "${GREEN}✅ UDEMY_TOKEN tồn tại${NC}"
else
    echo -e "${RED}❌ UDEMY_TOKEN không tồn tại${NC}"
    exit 1
fi
echo ""

# 3. Check Redis connection
echo "🔴 [3/6] Kiểm tra Redis connection..."
if redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis đang chạy${NC}"
    QUEUE_LEN=$(redis-cli LLEN rq:queue:downloads)
    echo "   Queue length: $QUEUE_LEN jobs"
else
    echo -e "${RED}❌ Redis không chạy${NC}"
    exit 1
fi
echo ""

# 4. Check database connection
echo "💾 [4/6] Kiểm tra MySQL connection..."
DB_HOST=$(grep DB_HOST .env | cut -d '=' -f2)
DB_USER=$(grep DB_USER .env | cut -d '=' -f2)
DB_PASS=$(grep DB_PASSWORD .env | cut -d '=' -f2)
DB_NAME=$(grep DB_NAME .env | cut -d '=' -f2)

if mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" -e "USE $DB_NAME; SELECT 1;" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ MySQL connection OK${NC}"
else
    echo -e "${RED}❌ MySQL connection FAILED${NC}"
    exit 1
fi
echo ""

# 5. Check staging directory structure
echo "📁 [5/6] Kiểm tra cấu trúc thư mục..."
cd /root/server/udemy_dl
if [ -d "Staging_Download" ]; then
    echo -e "${GREEN}✅ Staging_Download tồn tại${NC}"
    
    # List task directories
    TASK_DIRS=$(find Staging_Download -maxdepth 1 -type d -name "Task_*" 2>/dev/null | wc -l)
    if [ "$TASK_DIRS" -gt 0 ]; then
        echo "   Tìm thấy $TASK_DIRS task sandbox:"
        find Staging_Download -maxdepth 1 -type d -name "Task_*" -exec basename {} \; | head -5
        if [ "$TASK_DIRS" -gt 5 ]; then
            echo "   (và $((TASK_DIRS - 5)) task khác...)"
        fi
    else
        echo "   Chưa có task nào (OK nếu mới cài)"
    fi
else
    echo -e "${YELLOW}⚠️  Staging_Download chưa tồn tại (sẽ tạo khi chạy)${NC}"
fi
echo ""

# 6. Check worker processes
echo "⚙️  [6/6] Kiểm tra worker processes..."
WORKER_PIDS=$(pgrep -f "worker_rq.py" | wc -l)
if [ "$WORKER_PIDS" -gt 0 ]; then
    echo -e "${GREEN}✅ Tìm thấy $WORKER_PIDS worker đang chạy${NC}"
    ps aux | grep worker_rq.py | grep -v grep | awk '{print "   PID:", $2, "| Worker:", $NF}'
else
    echo -e "${YELLOW}⚠️  Không có worker nào đang chạy${NC}"
    echo "   Khởi động bằng: bash start_workers.sh"
fi
echo ""

# Summary
echo "=========================================="
echo "  KẾT QUẢ KIỂM TRA"
echo "=========================================="
echo ""
echo -e "${GREEN}✅ Tất cả kiểm tra cơ bản đã pass!${NC}"
echo ""
echo "📋 BƯỚC TIẾP THEO:"
echo "   1. Dừng workers cũ:  bash stop_workers.sh"
echo "   2. Khởi động lại:    bash start_workers.sh"
echo "   3. Xem log:          tail -f logs/rq_worker_1.log"
echo "   4. Đọc chi tiết:     cat WORKER_REFACTOR_SUMMARY.md"
echo ""
echo "🧪 TEST WEBHOOK:"
echo "   curl -X POST https://api.getcourses.net/api/v1/webhook/finalize \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -H 'X-Signature: test' \\"
echo "     -H 'X-Timestamp: $(date +%s)' \\"
echo "     -d '{\"secret_key\":\"YOUR_KEY\",\"task_id\":999,\"folder_name\":\"test\",\"timestamp\":\"$(date +%s)\"}'"
echo ""
