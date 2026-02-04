#!/bin/bash

# ==========================================
# Inzeedo POS - Full Stack VPS Deployment Script
# ==========================================
# This script provisions a fresh Ubuntu/Debian server for the Inzeedo POS Backend.
# It installs Node.js, MySQL, Nginx, PM2, configures the database, and deploys the app.
#
# Usage: sudo ./vps_deploy.sh
# ==========================================

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Please run as root (sudo ./vps_deploy.sh)${NC}"
  exit 1
fi

LOG_FILE="deploy_log_$(date +%Y%m%d_%H%M%S).log"
exec > >(tee -i $LOG_FILE)
exec 2>&1

echo -e "${BLUE}==============================================${NC}"
echo -e "${BLUE}   Starting Inzeedo POS VPS Deployment        ${NC}"
echo -e "${BLUE}==============================================${NC}"
echo -e "${YELLOW}Log file: $LOG_FILE${NC}"
sleep 2

# Navigate to script directory
cd "$(dirname "$0")"

# ----------------------------------------------------------------------
# 1. System Update & Prerequisites
# ----------------------------------------------------------------------
echo -e "\n${GREEN}[1/8] Updating System Packages...${NC}"
apt update && apt upgrade -y
apt install -y curl git ufw build-essential

# ----------------------------------------------------------------------
# 2. Install Node.js (if missing or old)
# ----------------------------------------------------------------------
echo -e "\n${GREEN}[2/8] Checking Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js not found. Installing Node.js 20.x LTS...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
else
    echo -e "Node.js is already installed: $(node -v)"
fi

# Install global tools
echo "Installing global packages (pm2, pnpm)..."
npm install -g pm2 pnpm

# ----------------------------------------------------------------------
# 3. Install MySQL Server (if missing)
# ----------------------------------------------------------------------
echo -e "\n${GREEN}[3/8] Checking MySQL...${NC}"
if ! command -v mysql &> /dev/null; then
    echo -e "${YELLOW}MySQL not found. Installing mysql-server...${NC}"
    apt install -y mysql-server
    
    # Secure installation is usually interactive. 
    # For automation, we will set a basic root password if one isn't set, 
    # but strictly advising the user to secure it later.
    echo -e "${YELLOW}NOTE: You should run 'mysql_secure_installation' manually after this script to secure your DB.${NC}"
else
    echo -e "MySQL is already installed: $(mysql --version)"
fi

# Ensure MySQL service is running
systemctl start mysql
systemctl enable mysql

# ----------------------------------------------------------------------
# 4. Install Nginx (if missing)
# ----------------------------------------------------------------------
echo -e "\n${GREEN}[4/8] Checking Nginx...${NC}"
if ! command -v nginx &> /dev/null; then
    echo -e "${YELLOW}Nginx not found. Installing nginx...${NC}"
    apt install -y nginx
else
    echo -e "Nginx is already installed: $(nginx -v)"
fi

# ----------------------------------------------------------------------
# 5. Application Configuration (.env)
# ----------------------------------------------------------------------
echo -e "\n${GREEN}[5/8] Configuring Application Environment...${NC}"

if [ ! -f .env ]; then
    echo -e "${YELLOW}.env file not found. Creating from .env.example...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${GREEN}Created .env from example.${NC}"
        
        # Interactive Prompt for Critical Vars
        echo -e "${YELLOW}Please configure your Database Credentials now.${NC}"
        read -p "Enter Database Host [localhost]: " INPUT_DB_HOST
        DB_HOST=${INPUT_DB_HOST:-localhost}
        
        read -p "Enter Database User [root]: " INPUT_DB_USER
        DB_USER=${INPUT_DB_USER:-root}
        
        read -s -p "Enter Database Password: " INPUT_DB_PASS
        echo ""
        DB_PASSWORD=$INPUT_DB_PASS
        
        read -p "Enter Database Name [pos_system]: " INPUT_DB_NAME
        DB_NAME=${INPUT_DB_NAME:-pos_system}
        
        # Update .env using sed
        sed -i "s/DB_HOST=localhost/DB_HOST=$DB_HOST/" .env
        sed -i "s/DB_USER=root/DB_USER=$DB_USER/" .env
        sed -i "s/DB_PASSWORD=your_db_password/DB_PASSWORD=$DB_PASSWORD/" .env
        sed -i "s/DB_NAME=pos_system/DB_NAME=$DB_NAME/" .env
        sed -i "s/NODE_ENV=production/NODE_ENV=production/" .env
        
    else
        echo -e "${RED}Error: .env.example not found! Cannot configure app.${NC}"
        exit 1
    fi
else
    echo -e "Using existing .env file."
    # still read vars for script usage
    export $(grep -v '^#' .env | xargs)
fi

# Reload env vars
export $(grep -v '^#' .env | xargs)

# ----------------------------------------------------------------------
# 6. Database Setup
# ----------------------------------------------------------------------
echo -e "\n${GREEN}[6/8] Setting up Database...${NC}"

# Install Dependencies
echo "Installing project dependencies..."
pnpm install

# Try to create database if it doesn't exist (Using mysql cli)
echo "Checking if database '$DB_NAME' exists..."

EXIT_CODE=0
mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" -e "USE $DB_NAME" 2>/dev/null || EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo -e "${YELLOW}Database '$DB_NAME' does not exist. Attempting to create...${NC}"
    mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" -e "CREATE DATABASE $DB_NAME;"
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Database created successfully.${NC}"
    else
        echo -e "${RED}Failed to create database. Please check credentials in .env${NC}"
        exit 1
    fi
fi

# Run Migrations
echo "Running Sequelize Migrations..."
pnpm run db:migrate

# ----------------------------------------------------------------------
# 7. Setup PM2 Process Manager
# ----------------------------------------------------------------------
echo -e "\n${GREEN}[7/8] Configuring PM2...${NC}"

# Check if process exists
pm2 describe pos-backend > /dev/null
if [ $? -eq 0 ]; then
    echo "Restarting existing PM2 process..."
    pm2 restart pos-backend
else
    echo "Starting new PM2 process..."
    pm2 start server.js --name "pos-backend"
fi

# Save and Startup
pm2 save
pm2 startup | tail -n 1 | bash > /dev/null 2>&1 # Execute the startup command automatically if possible, otherwise user does it manually usually.
# Just echo instructions just in case
echo -e "${BLUE}PM2 configured. If the server reboots, PM2 will restart the app.${NC}"

# ----------------------------------------------------------------------
# 8. Setup Nginx Reverse Proxy
# ----------------------------------------------------------------------
echo -e "\n${GREEN}[8/8] Configuring Nginx Reverse Proxy...${NC}"

DOMAIN_NAME="localhost" # Change this or prompt for it
read -p "Enter Domain Name or IP for Nginx [localhost]: " INPUT_DOMAIN
DOMAIN_NAME=${INPUT_DOMAIN:-localhost}

NGINX_CONF="/etc/nginx/sites-available/pos-backend"

cat > $NGINX_CONF <<EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;

    location / {
        proxy_pass http://localhost:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # Increase max upload size for image uploads
    client_max_body_size 10M;
}
EOF

# Enable Site
ln -sf $NGINX_CONF /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and Reload
nginx -t
if [ $? -eq 0 ]; then
    systemctl reload nginx
    echo -e "${GREEN}Nginx configured and reloaded.${NC}"
else
    echo -e "${RED}Nginx configuration failed. Please check $NGINX_CONF${NC}"
fi

# Setup UFW
ufw allow 'Nginx Full'
ufw allow OpenSSH
# ufw enable # Doing this automatically can lock user out if SSH not configured right. Leaving manual.

echo -e "${BLUE}==============================================${NC}"
echo -e "${GREEN}   Deployment Complete!   ${NC}"
echo -e "${BLUE}==============================================${NC}"
echo -e "Backend is running on port $PORT"
echo -e "Nginx is proxying $DOMAIN_NAME -> ::$PORT"
echo -e "View logs with: pm2 logs pos-backend"
