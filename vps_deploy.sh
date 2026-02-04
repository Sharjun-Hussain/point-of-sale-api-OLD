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
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Log file
LOG_FILE="deploy_log_$(date +%Y%m%d_%H%M%S).log"

# Print colored section headers
print_section() {
    echo -e "\n${CYAN}==============================================${NC}"
    echo -e "${CYAN}   $1${NC}"
    echo -e "${CYAN}==============================================${NC}"
}

# Print colored status messages
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[i]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}${BOLD}Please run as root (sudo ./vps_deploy.sh)${NC}"
    exit 1
fi

# Start logging
exec > >(tee -i $LOG_FILE)
exec 2>&1

print_section "Starting Inzeedo POS VPS Deployment"
echo -e "${YELLOW}Log file: $LOG_FILE${NC}"
sleep 2

# Navigate to script directory
cd "$(dirname "$0")"

# ----------------------------------------------------------------------
# 1. System Update & Prerequisites
# ----------------------------------------------------------------------
print_section "1/8: System Update & Prerequisites"
print_status "Updating system packages..."
apt update
apt upgrade -y
apt install -y curl git ufw build-essential software-properties-common

# ----------------------------------------------------------------------
# 2. Install Node.js (if missing or old)
# ----------------------------------------------------------------------
print_section "2/8: Installing Node.js"
if ! command -v node &> /dev/null; then
    print_warning "Node.js not found. Installing Node.js 20.x LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
    print_status "Node.js installed: $(node -v)"
else
    print_status "Node.js already installed: $(node -v)"
fi

# Install global tools
print_status "Installing global packages (pm2, pnpm)..."
npm install -g pm2 pnpm
print_status "PM2 version: $(pm2 --version 2>/dev/null || echo 'Not installed')"

# ----------------------------------------------------------------------
# 3. Install MySQL Server (if missing)
# ----------------------------------------------------------------------
print_section "3/8: Installing MySQL Server"
if ! command -v mysql &> /dev/null; then
    print_warning "MySQL not found. Installing mysql-server..."
    apt install -y mysql-server
    
    # Secure installation - automated version
    print_status "Securing MySQL installation..."
    
    # Start MySQL service
    systemctl start mysql
    systemctl enable mysql
    
    # Check if root password is already set
    if mysql -u root -e "SELECT 1" >/dev/null 2>&1; then
        print_warning "MySQL root password appears to be empty or using auth_socket."
        print_warning "Please set a root password manually after deployment with:"
        echo -e "${YELLOW}  sudo mysql_secure_installation${NC}"
    fi
else
    print_status "MySQL already installed: $(mysql --version | head -n1)"
fi

# Ensure MySQL service is running
systemctl start mysql
systemctl enable mysql

# ----------------------------------------------------------------------
# 4. Install Nginx (if missing)
# ----------------------------------------------------------------------
print_section "4/8: Installing Nginx"
if ! command -v nginx &> /dev/null; then
    print_warning "Nginx not found. Installing..."
    apt install -y nginx
    print_status "Nginx installed: $(nginx -v 2>&1)"
else
    print_status "Nginx already installed: $(nginx -v 2>&1)"
fi

# ----------------------------------------------------------------------
# 5. Application Configuration (.env)
# ----------------------------------------------------------------------
print_section "5/8: Configuring Application Environment"

SETUP_ENV=false
DB_HOST="localhost"
DB_USER=""
DB_PASSWORD=""
DB_NAME="pos_system"
PORT="3000"

if [ ! -f .env ]; then
    print_warning ".env file not found."
    if [ -f .env.example ]; then
        cp .env.example .env
        SETUP_ENV=true
        print_status "Created .env from .env.example"
    else
        print_error ".env.example not found! Cannot configure app."
        exit 1
    fi
else
    print_status "Existing .env file found."
    read -p "$(echo -e ${YELLOW}"Do you want to reconfigure .env credentials? (y/N): "${NC})" RECONF
    if [[ "$RECONF" =~ ^[Yy]$ ]]; then
        cp .env.example .env
        SETUP_ENV=true
        print_status "Reset .env to default configuration"
    else
        print_status "Using existing .env configuration"
    fi
fi

if [ "$SETUP_ENV" = true ]; then
    echo -e "\n${YELLOW}=== DATABASE CONFIGURATION ===${NC}"
    
    read -p "$(echo -e ${YELLOW}"Enter Database Host [localhost]: "${NC})" INPUT_DB_HOST
    DB_HOST=${INPUT_DB_HOST:-localhost}
    
    read -p "$(echo -e ${YELLOW}"Enter Database User [pos_user]: "${NC})" INPUT_DB_USER
    DB_USER=${INPUT_DB_USER:-pos_user}
    
    while true; do
        read -s -p "$(echo -e ${YELLOW}"Enter Database Password: "${NC})" INPUT_DB_PASS
        echo ""
        if [ -z "$INPUT_DB_PASS" ]; then
            print_error "Password cannot be empty!"
        else
            DB_PASSWORD=$INPUT_DB_PASS
            break
        fi
    done
    
    read -p "$(echo -e ${YELLOW}"Enter Database Name [pos_system]: "${NC})" INPUT_DB_NAME
    DB_NAME=${INPUT_DB_NAME:-pos_system}
    
    read -p "$(echo -e ${YELLOW}"Enter Application Port [3000]: "${NC})" INPUT_PORT
    PORT=${INPUT_PORT:-3000}
    
    # Update .env using sed
    print_status "Updating .env file..."
    sed -i "s/DB_HOST=.*/DB_HOST=$DB_HOST/" .env
    sed -i "s/DB_USER=.*/DB_USER=$DB_USER/" .env
    sed -i "s/DB_PASSWORD=.*/DB_PASSWORD=$DB_PASSWORD/" .env
    sed -i "s/DB_NAME=.*/DB_NAME=$DB_NAME/" .env
    sed -i "s/PORT=.*/PORT=$PORT/" .env
    sed -i "s/NODE_ENV=.*/NODE_ENV=production/" .env
    
    print_status "Environment configuration saved to .env"
fi

# Reload env vars
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
    print_status "Environment variables loaded"
fi

# ----------------------------------------------------------------------
# 6. Database Setup
# ----------------------------------------------------------------------
print_section "6/8: Setting up Database"

# Install Dependencies
print_status "Installing project dependencies..."
pnpm install

# Database setup
echo -e "\n${YELLOW}=== MYSQL DATABASE SETUP ===${NC}"
echo -e "${YELLOW}We need SUPERUSER privileges to create the database and user.${NC}"

read -p "$(echo -e ${YELLOW}"MySQL Admin User [root]: "${NC})" ADMIN_DB_USER
ADMIN_DB_USER=${ADMIN_DB_USER:-root}

read -s -p "$(echo -e ${YELLOW}"MySQL Admin Password (press Enter if none): "${NC})" ADMIN_DB_PASS
echo ""

# Try to connect with Admin credentials
print_status "Testing MySQL admin connection..."

if mysql -h "$DB_HOST" -u "$ADMIN_DB_USER" ${ADMIN_DB_PASS:+-p$ADMIN_DB_PASS} -e "SELECT 1;" 2>/dev/null; then
    print_status "MySQL admin connection successful"
    
    # Create database
    print_status "Creating database '$DB_NAME'..."
    mysql -h "$DB_HOST" -u "$ADMIN_DB_USER" ${ADMIN_DB_PASS:+-p$ADMIN_DB_PASS} <<EOF 2>/dev/null
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;
EOF
    
    if [ $? -eq 0 ]; then
        print_status "Database '$DB_NAME' created/verified"
    else
        print_error "Failed to create database"
    fi
    
    # Create or update application user
    print_status "Configuring application user '$DB_USER'..."
    
    mysql -h "$DB_HOST" -u "$ADMIN_DB_USER" ${ADMIN_DB_PASS:+-p$ADMIN_DB_PASS} <<EOF 2>/dev/null
-- Drop user if exists (clean slate)
DROP USER IF EXISTS '$DB_USER'@'localhost';

-- Create user with password
CREATE USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';

-- Grant all privileges on the database
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';

-- Grant process privilege to see all processes
GRANT PROCESS ON *.* TO '$DB_USER'@'localhost';

-- Apply changes
FLUSH PRIVILEGES;
EOF
    
    if [ $? -eq 0 ]; then
        print_status "User '$DB_USER' created with full privileges on '$DB_NAME'"
    else
        print_error "Failed to create user"
    fi
    
else
    print_warning "Could not connect with admin credentials."
    print_warning "Attempting to connect without password (auth_socket)..."
    
    if mysql -h "$DB_HOST" -u "$ADMIN_DB_USER" -e "SELECT 1;" 2>/dev/null; then
        print_status "Connected using auth_socket"
        
        # Create database and user using auth_socket
        mysql -h "$DB_HOST" -u "$ADMIN_DB_USER" <<EOF 2>/dev/null
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

DROP USER IF EXISTS '$DB_USER'@'localhost';
CREATE USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
GRANT PROCESS ON *.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
EOF
        
        if [ $? -eq 0 ]; then
            print_status "Database and user created successfully"
        else
            print_error "Failed to create database/user with auth_socket"
        fi
    else
        print_error "Could not connect to MySQL. Please check:"
        print_error "1. MySQL service is running: sudo systemctl status mysql"
        print_error "2. Root password is set correctly"
        print_error "Skipping database setup. You'll need to configure manually."
    fi
fi

# Test connection with app credentials
print_status "Testing connection with application credentials..."
if mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1;" 2>/dev/null; then
    print_status "Application credentials verified successfully"
else
    print_error "Application credentials test failed!"
    print_warning "You may need to manually create the user:"
    echo -e "${YELLOW}  mysql -u root -p${NC}"
    echo -e "${YELLOW}  CREATE USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';${NC}"
    echo -e "${YELLOW}  GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'localhost';${NC}"
    echo -e "${YELLOW}  FLUSH PRIVILEGES;${NC}"
fi

# Run Migrations
print_status "Running database migrations..."
if pnpm run db:migrate; then
    print_status "Database migrations completed successfully"
else
    print_error "Database migrations failed!"
    print_warning "You may need to run migrations manually:"
    echo -e "${YELLOW}  pnpm run db:migrate${NC}"
fi

# ----------------------------------------------------------------------
# 7. Setup PM2 Process Manager
# ----------------------------------------------------------------------
print_section "7/8: Configuring PM2 Process Manager"

# Check if process exists
if pm2 describe pos-backend > /dev/null 2>&1; then
    print_status "Restarting existing PM2 process..."
    pm2 restart pos-backend
else
    print_status "Starting new PM2 process..."
    pm2 start server.js --name "pos-backend"
fi

# Save and setup startup
pm2 save
pm2 startup | tail -n 1 | bash > /dev/null 2>&1 
print_status "PM2 configured to start on boot"

# Display PM2 status
echo ""
pm2 status pos-backend

# ----------------------------------------------------------------------
# 8. Setup Nginx Reverse Proxy
# ----------------------------------------------------------------------
print_section "8/8: Configuring Nginx Reverse Proxy"

read -p "$(echo -e ${YELLOW}"Enter Domain Name or IP for Nginx [localhost]: "${NC})" INPUT_DOMAIN
DOMAIN_NAME=${INPUT_DOMAIN:-localhost}

NGINX_CONF="/etc/nginx/sites-available/pos-backend"

print_status "Creating Nginx configuration for $DOMAIN_NAME..."

cat > $NGINX_CONF <<EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # API Proxy
    location / {
        proxy_pass http://localhost:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_buffering off;
    }
    
    # Increase max upload size for image uploads
    client_max_body_size 10M;
    
    # Rate limiting
    limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;
    
    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}
EOF

# Enable Site
if [ -f "$NGINX_CONF" ]; then
    ln -sf $NGINX_CONF /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    print_status "Nginx configuration created at $NGINX_CONF"
    
    # Test configuration
    print_status "Testing Nginx configuration..."
    if nginx -t; then
        systemctl reload nginx
        print_status "Nginx configured and reloaded successfully"
    else
        print_error "Nginx configuration test failed!"
        print_warning "Please check the configuration file: $NGINX_CONF"
    fi
else
    print_error "Failed to create Nginx configuration"
fi

# ----------------------------------------------------------------------
# 9. Configure Firewall
# ----------------------------------------------------------------------
print_section "Firewall Configuration"

# Enable UFW if not enabled
if ufw status | grep -q "inactive"; then
    print_status "Configuring firewall..."
    ufw allow ssh
    ufw allow 'Nginx Full'
    ufw allow 22/tcp
    ufw --force enable
    print_status "Firewall enabled with SSH and HTTP/HTTPS access"
else
    print_status "Firewall already active"
fi

# ----------------------------------------------------------------------
# 10. Final Summary
# ----------------------------------------------------------------------
print_section "DEPLOYMENT COMPLETE!"
echo -e "${GREEN}${BOLD}✓ Inzeedo POS Backend Successfully Deployed!${NC}"
echo ""
echo -e "${CYAN}${BOLD}Application Details:${NC}"
echo -e "${BLUE}• Backend URL:${NC} http://localhost:$PORT"
echo -e "${BLUE}• Nginx Proxy:${NC} http://$DOMAIN_NAME -> http://localhost:$PORT"
echo -e "${BLUE}• Database:${NC} $DB_NAME (User: $DB_USER)"
echo -e "${BLUE}• Environment:${NC} Production"
echo ""
echo -e "${CYAN}${BOLD}Management Commands:${NC}"
echo -e "${YELLOW}View logs:${NC}          pm2 logs pos-backend"
echo -e "${YELLOW}Restart app:${NC}        pm2 restart pos-backend"
echo -e "${YELLOW}Check status:${NC}       pm2 status"
echo -e "${YELLOW}View Nginx logs:${NC}    tail -f /var/log/nginx/error.log"
echo -e "${YELLOW}MySQL access:${NC}       mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME"
echo ""
echo -e "${CYAN}${BOLD}Next Steps:${NC}"
echo -e "1. Test the API: ${YELLOW}curl http://$DOMAIN_NAME/api/health${NC}"
echo -e "2. Secure MySQL: ${YELLOW}sudo mysql_secure_installation${NC}"
echo -e "3. Setup SSL/TLS (Certbot): ${YELLOW}sudo apt install certbot python3-certbot-nginx${NC}"
echo -e "4. Configure backup for database"
echo ""
echo -e "${MAGENTA}Deployment log saved to: $LOG_FILE${NC}"
echo -e "${GREEN}${BOLD}Thank you for using Inzeedo POS!${NC}"