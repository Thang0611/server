#!/bin/bash
# Quick test script để verify backup hoạt động

echo "🧪 Testing Backup Scripts..."
echo ""

# Test database backup
echo "1. Testing database backup..."
./scripts/backup/backup-database.sh --compress > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✅ Database backup: OK"
    ls -lh backup/database/*.sql.gz | tail -1
else
    echo "   ❌ Database backup: FAILED"
fi

echo ""

# Test server backup
echo "2. Testing server backup..."
./scripts/backup/backup-server.sh --exclude-logs --exclude-node-modules > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✅ Server backup: OK"
    ls -lh backup/server/*.tar.gz | tail -1
else
    echo "   ❌ Server backup: FAILED"
fi

echo ""
echo "✨ Test completed!"
