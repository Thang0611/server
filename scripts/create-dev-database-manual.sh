#!/bin/bash

###############################################################################
# Manual Database Creation Script
# 
# Use this if user 'nht' doesn't have CREATE DATABASE permission
# Run as root or user with CREATE DATABASE permission
#
# Usage: 
#   sudo mysql < this_script
#   OR
#   mysql -u root -p < this_script
###############################################################################

# Create development database
CREATE DATABASE IF NOT EXISTS `udemy_bot_dev` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# Grant permissions to user nht
GRANT ALL PRIVILEGES ON `udemy_bot_dev`.* TO 'nht'@'localhost';
FLUSH PRIVILEGES;

# Show result
SHOW DATABASES LIKE 'udemy_bot_dev';
