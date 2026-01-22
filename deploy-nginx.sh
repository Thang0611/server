#!/bin/bash

##############################################################################
# Nginx Deployment Script for KhoaHocGiaRe.info
# Author: Senior DevOps Engineer
# Usage: sudo bash deploy-nginx.sh
##############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    print_error "Please run as root (use sudo)"
    exit 1
fi

print_status "Starting Nginx deployment..."

# 1. Backup existing configuration
print_status "Backing up existing configuration..."
if [ -f /etc/nginx/sites-available/default ]; then
    cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup.$(date +%Y%m%d_%H%M%S)
    print_success "Backup created"
fi

# 2. Copy new configuration
print_status "Installing new configuration..."
cp /root/server/nginx-config.conf /etc/nginx/sites-available/getcourses.net

# 3. Remove default site if exists
if [ -L /etc/nginx/sites-enabled/default ]; then
    print_status "Removing default site..."
    rm /etc/nginx/sites-enabled/default
fi

# 4. Create symbolic link
print_status "Creating symbolic link..."
if [ ! -L /etc/nginx/sites-enabled/getcourses.net ]; then
    ln -s /etc/nginx/sites-available/getcourses.net /etc/nginx/sites-enabled/
    print_success "Symbolic link created"
else
    print_warning "Symbolic link already exists"
fi

# 5. Create log directory if not exists
print_status "Ensuring log directory exists..."
mkdir -p /var/log/nginx
chmod 755 /var/log/nginx

# 6. Test Nginx configuration
print_status "Testing Nginx configuration..."
if nginx -t; then
    print_success "Configuration test passed!"
else
    print_error "Configuration test failed!"
    print_error "Rolling back to previous configuration..."
    rm /etc/nginx/sites-enabled/getcourses.net
    if [ -f /etc/nginx/sites-available/default.backup.* ]; then
        latest_backup=$(ls -t /etc/nginx/sites-available/default.backup.* | head -1)
        cp "$latest_backup" /etc/nginx/sites-available/default
        ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/
    fi
    exit 1
fi

# 7. Reload Nginx
print_status "Reloading Nginx..."
if systemctl reload nginx; then
    print_success "Nginx reloaded successfully!"
else
    print_error "Failed to reload Nginx"
    print_status "Attempting to restart..."
    systemctl restart nginx
fi

# 8. Check Nginx status
print_status "Checking Nginx status..."
if systemctl is-active --quiet nginx; then
    print_success "Nginx is running!"
else
    print_error "Nginx is not running!"
    systemctl status nginx
    exit 1
fi

# 9. Display configuration info
echo ""
print_success "========================================="
print_success "Nginx Deployment Completed Successfully!"
print_success "========================================="
echo ""
print_status "Active server blocks:"
echo "  • http://api.getcourses.net → localhost:3000"
echo "  • http://getcourses.net → localhost:3001"
echo "  • http://www.getcourses.net → localhost:3001"
echo ""
print_status "Log files:"
echo "  • API Access: /var/log/nginx/api.getcourses.net.access.log"
echo "  • API Error: /var/log/nginx/api.getcourses.net.error.log"
echo "  • Frontend Access: /var/log/nginx/getcourses.net.access.log"
echo "  • Frontend Error: /var/log/nginx/getcourses.net.error.log"
echo ""
print_status "Next steps:"
echo "  1. Ensure backend is running on port 3000"
echo "  2. Ensure frontend is running on port 3001"
echo "  3. Test domains: curl -I http://getcourses.net"
echo "  4. Consider installing SSL with certbot (see SSL_SETUP.md)"
echo ""
