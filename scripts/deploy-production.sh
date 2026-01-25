#!/bin/bash

# ============================================================================
# Production Deployment Script
# ============================================================================
# Usage: ./deploy-production.sh
# ============================================================================

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🚀 Production Deployment Script${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Please run as root${NC}"
    exit 1
fi

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo -e "${GREEN}✅ Loaded environment variables${NC}"
else
    echo -e "${RED}❌ .env file not found${NC}"
    exit 1
fi

# Step 1: Backup database
echo -e "${BLUE}📦 Step 1: Creating database backup...${NC}"
if [ -f scripts/backup-udemy-bot.sh ]; then
    chmod +x scripts/backup-udemy-bot.sh
    ./scripts/backup-udemy-bot.sh before_deployment_$(date +%Y%m%d_%H%M%S)
    echo -e "${GREEN}✅ Backup completed${NC}"
else
    echo -e "${YELLOW}⚠️  Backup script not found, skipping...${NC}"
fi

# Step 2: Run database migration
echo ""
echo -e "${BLUE}🗄️  Step 2: Running database migration...${NC}"
if [ -f scripts/migrations/migrate_to_udemy_bot.sql ]; then
    mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" < scripts/migrations/migrate_to_udemy_bot.sql
    echo -e "${GREEN}✅ Database migration completed${NC}"
else
    echo -e "${RED}❌ Migration file not found${NC}"
    exit 1
fi

# Step 3: Install/Update dependencies
echo ""
echo -e "${BLUE}📦 Step 3: Installing dependencies...${NC}"
npm install --production
echo -e "${GREEN}✅ Dependencies installed${NC}"

# Step 4: Build frontend
echo ""
echo -e "${BLUE}🏗️  Step 4: Building frontend...${NC}"
cd ../clone-app
npm install --production
npm run build
cd ../server
echo -e "${GREEN}✅ Frontend built${NC}"

# Step 5: Restart services
echo ""
echo -e "${BLUE}🔄 Step 5: Restarting services...${NC}"
pm2 restart ecosystem.config.js --update-env
pm2 save
echo -e "${GREEN}✅ Services restarted${NC}"

# Step 6: Verify
echo ""
echo -e "${BLUE}✅ Step 6: Verifying deployment...${NC}"
sleep 5
pm2 status
echo ""
echo -e "${GREEN}✨ Deployment completed successfully!${NC}"
