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
apt update
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
# 5. Application Configuration (.env)
# ----------------------------------------------------------------------
echo -e "\n${GREEN}[5/8] Configuring Application Environment...${NC}"

SETUP_ENV=false

if [ ! -f .env ]; then
    echo -e "${YELLOW}.env file not found. Creating from .env.example...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        SETUP_ENV=true
    else
        echo -e "${RED}Error: .env.example not found! Cannot configure app.${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}Existing .env file found.${NC}"
    read -p "Do you want to reconfigure .env credentials? (y/N): " RECONF
    if [[ "$RECONF" =~ ^[Yy]$ ]]; then
        # Reset provided env to example
        cp .env.example .env
        SETUP_ENV=true
    else
         echo -e "Using existing .env configuration."
    fi
fi

if [ "$SETUP_ENV" = true ]; then
    # Interactive Prompt for Critical Vars
    echo -e "${YELLOW}Please configure your APP Database Credentials (user for running the app).${NC}"
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
    # Escape special chars in password for sed
    SAFE_PASS=$(echo $DB_PASSWORD | sed 's/[&/\]/\\&/g')
    sed -i "s/DB_PASSWORD=your_db_password/DB_PASSWORD=$SAFE_PASS/" .env
    sed -i "s/DB_NAME=pos_system/DB_NAME=$DB_NAME/" .env
    sed -i "s/NODE_ENV=production/NODE_ENV=production/" .env
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

# Capture Admin Credentials for Setup
echo -e "${YELLOW}We need SUPERUSER privileges to create the database/users if they don't exist.${NC}"
echo -e "${YELLOW}Please enter MySQL Admin credentials (often 'root').${NC}"

read -p "MySQL Admin User [root]: " ADMIN_DB_USER
ADMIN_DB_USER=${ADMIN_DB_USER:-root}

read -s -p "MySQL Admin Password: " ADMIN_DB_PASS
echo ""

# Try to create database if it doesn't exist (Using mysql cli)
echo "Checking if database '$DB_NAME' exists..."

EXIT_CODE=0
# Check connection first
mysql -h "$DB_HOST" -u "$ADMIN_DB_USER" -p"$ADMIN_DB_PASS" -e "SELECT 1" 2>/dev/null
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to connect to MySQL with provided Admin credentials.${NC}"
    echo -e "${RED}Skipping DB creation. Warning: Migrations might fail if DB doesn't exist.${NC}"
else
    # Try to create DB
    mysql -h "$DB_HOST" -u "$ADMIN_DB_USER" -p"$ADMIN_DB_PASS" -e "CREATE DATABASE IF NOT EXISTS $DB_NAME;" 2>/dev/null
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Database '$DB_NAME' verified/created.${NC}"
        
        # Optional: Grant privileges if the app user is different from root
        if [ "$DB_USER" != "root" ]; then
             echo "Granting privileges to '$DB_USER'..."
             mysql -h "$DB_HOST" -u "$ADMIN_DB_USER" -p"$ADMIN_DB_PASS" -e "CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD'; GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'localhost'; FLUSH PRIVILEGES;" 2>/dev/null
        fi
    else
        echo -e "${RED}Failed to create database. Check permissions.${NC}"
    fi
fi

# Run Migrations (Using App Credentials from .env)
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
pm2 startup | tail -n 1 | bash > /dev/null 2>&1 
echo -e "${BLUE}PM2 configured. If the server reboots, PM2 will restart the app.${NC}"

# ----------------------------------------------------------------------
# 8. Setup Nginx Reverse Proxy
# ----------------------------------------------------------------------
echo -e "\n${GREEN}[8/8] Configuring Nginx Reverse Proxy...${NC}"

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

echo -e "${BLUE}==============================================${NC}"
echo -e "${GREEN}   Deployment Complete!   ${NC}"
echo -e "${BLUE}==============================================${NC}"
echo -e "Backend is running on port $PORT"
echo -e "Nginx is proxying $DOMAIN_NAME -> ::$PORT"
echo -e "View logs with: pm2 logs pos-backend"
