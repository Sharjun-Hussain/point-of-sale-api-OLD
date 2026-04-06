#!/bin/bash

# ==========================================
# Inzeedo POS - Full Stack VPS Cleanup Script
# ==========================================
# This script removes the Inzeedo POS Backend from the server.
# It deletes PM2 processes, Nginx configurations, and the database.
#
# Usage: sudo ./vps_cleanup.sh
# ==========================================

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

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
    echo -e "${RED}${BOLD}Please run as root (sudo ./vps_cleanup.sh)${NC}"
    exit 1
fi

print_section "Starting Inzeedo POS VPS Cleanup"
echo -e "${RED}${BOLD}WARNING: This script will delete the application, database, and configurations!${NC}"
echo -e "${RED}This action cannot be undone.${NC}"
read -p "$(echo -e ${YELLOW}"Are you sure you want to proceed? (y/N): "${NC})" CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    print_info "Cleanup aborted."
    exit 0
fi

# Load env vars if exists
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
    print_status "Environment variables loaded from .env"
else
    print_warning ".env file not found. Script will attempt to remove default names."
fi

# ----------------------------------------------------------------------
# 1. Stop and Remove PM2 Process
# ----------------------------------------------------------------------
print_section "1/5: Cleaning up PM2 Process"
APP_NAME="pos-backend"

if pm2 describe $APP_NAME > /dev/null 2>&1; then
    print_status "Stopping and deleting PM2 process '$APP_NAME'..."
    pm2 stop $APP_NAME
    pm2 delete $APP_NAME
    pm2 save
    print_status "PM2 process removed."
else
    print_warning "PM2 process '$APP_NAME' not found. Skipping."
fi

# ----------------------------------------------------------------------
# 2. Remove Nginx Configuration
# ----------------------------------------------------------------------
print_section "2/5: Removing Nginx Configuration"
NGINX_SITE="pos-backend"
NGINX_AVAILABLE="/etc/nginx/sites-available/$NGINX_SITE"
NGINX_ENABLED="/etc/nginx/sites-enabled/$NGINX_SITE"

# Try to extract domain for SSL cleanup later
DOMAIN_NAME=""
if [ -f "$NGINX_AVAILABLE" ]; then
    DOMAIN_NAME=$(grep "server_name" "$NGINX_AVAILABLE" | head -n1 | awk '{print $2}' | tr -d ';')
    print_info "Detected domain: $DOMAIN_NAME"
fi

if [ -L "$NGINX_ENABLED" ]; then
    rm "$NGINX_ENABLED"
    print_status "Removed site from sites-enabled."
fi

if [ -f "$NGINX_AVAILABLE" ]; then
    rm "$NGINX_AVAILABLE"
    print_status "Removed site from sites-available."
fi

# Reload Nginx
print_status "Reloading Nginx..."
if nginx -t > /dev/null 2>&1; then
    systemctl reload nginx
    print_status "Nginx reloaded."
else
    print_error "Nginx configuration test failed. Please check your other sites."
fi

# Remove logs
print_status "Removing Nginx logs..."
rm -f /var/log/nginx/pos-backend-access.log /var/log/nginx/pos-backend-error.log
print_status "Logs removed."

# ----------------------------------------------------------------------
# 3. Remove SSL Certificates (Certbot)
# ----------------------------------------------------------------------
if [ ! -z "$DOMAIN_NAME" ] && [ "$DOMAIN_NAME" != "localhost" ] && [[ ! $DOMAIN_NAME =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    print_section "3/5: Removing SSL Certificates"
    read -p "$(echo -e ${YELLOW}"Do you want to delete SSL certificates for $DOMAIN_NAME? (y/N): "${NC})" DELETE_SSL
    if [[ "$DELETE_SSL" =~ ^[Yy]$ ]]; then
        if command -v certbot &> /dev/null; then
            print_status "Deleting certificate for $DOMAIN_NAME..."
            certbot delete --cert-name $DOMAIN_NAME --non-interactive
            print_status "Certificate removed."
        else
            print_warning "Certbot not found. Skipping SSL deletion."
        fi
    else
        print_info "Keeping SSL certificates."
    fi
else
    print_section "3/5: Skipping SSL removal (No valid domain detected)"
fi

# ----------------------------------------------------------------------
# 4. Drop Database and User
# ----------------------------------------------------------------------
print_section "4/5: Cleaning up Database"

DB_NAME=${DB_NAME:-pos_system}
DB_USER=${DB_USER:-pos_user}

read -p "$(echo -e ${YELLOW}"Enter MySQL root password (leave blank for none/auth_socket): "${NC})" MYSQL_ROOT_PASS

print_status "Dropping database '$DB_NAME' and user '$DB_USER'..."

mysql -u root ${MYSQL_ROOT_PASS:+-p$MYSQL_ROOT_PASS} <<EOF 2>/dev/null
DROP DATABASE IF EXISTS \`$DB_NAME\`;
DROP USER IF EXISTS '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
EOF

if [ $? -eq 0 ]; then
    print_status "Database and user deleted successfully."
else
    print_error "Failed to delete database/user. You may need to do it manually."
    print_info "Manual commands:"
    echo -e "  mysql -u root -p -e \"DROP DATABASE $DB_NAME; DROP USER '$DB_USER'@'localhost';\""
fi

# ----------------------------------------------------------------------
# 5. Clean up Application Files
# ----------------------------------------------------------------------
print_section "5/5: Final Cleanup"
read -p "$(echo -e ${YELLOW}"Do you want to delete ALL application files in this directory? (y/N): "${NC})" DELETE_FILES
if [[ "$DELETE_FILES" =~ ^[Yy]$ ]]; then
    print_status "Cleaning up application files..."
    # We remove everything except the script itself to prevent it from crashing mid-execution
    SCRIPT_NAME=$(basename "$0")
    find . -maxdepth 1 ! -name "$SCRIPT_NAME" ! -name "." -exec rm -rf {} +
    print_status "Application files removed."
    print_info "NOTE: This folder still contains '$SCRIPT_NAME'. You can remove it manually after this script exits."
else
    print_info "Application files kept."
fi

print_section "CLEANUP COMPLETE!"
echo -e "${GREEN}${BOLD}✓ Inzeedo POS Backend has been removed from the server.${NC}"
echo -e "${YELLOW}Note: System packages (Node.js, MySQL, Nginx) were NOT uninstalled as requested.${NC}"
echo ""
echo -e "${CYAN}Thank you for using Inzeedo POS!${NC}"
