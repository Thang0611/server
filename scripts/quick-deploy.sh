#!/bin/bash

# ============================================================================
# Quick Deployment Script
# ============================================================================
# Fast deployment for production updates
# ============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}⚡ Quick Deployment${NC}"
echo ""

# Step 1: Pull latest code
echo -e "${BLUE}📥 Pulling latest code...${NC}"
cd /root/project
git pull origin main || echo -e "${RED}⚠️  Git pull failed (continuing anyway)${NC}"

# Step 2: Install dependencies
echo -e "${BLUE}📦 Installing dependencies...${NC}"
cd /root/project/server
npm install --production

cd /root/project/clone-app
npm install --production

# Step 3: Build frontend
echo -e "${BLUE}🏗️  Building frontend...${NC}"
npm run build

# Step 4: Restart services
echo -e "${BLUE}🔄 Restarting services...${NC}"
cd /root/project/server
pm2 restart ecosystem.config.js --update-env

# Step 5: Verify
echo -e "${BLUE}✅ Verifying...${NC}"
sleep 3
pm2 status

echo ""
echo -e "${GREEN}✨ Quick deployment completed!${NC}"
