#!/bin/bash

# ======================================================================
# INZEEDO POS - INDUSTRIAL VPS DEPLOYMENT PRO
# ======================================================================
# This script provisions and deploys the Inzeedo POS Backend on a VPS.
# It handles dependencies, DB bootstrap/migrations, Nginx, and SSL.
# ======================================================================

# --- Colors & Aesthetics ---
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

LOG_FILE="industrial_deploy_$(date +%Y%m%d_%H%M%S).log"

print_header() {
    clear
    echo -e "${CYAN}${BOLD}======================================================================${NC}"
    echo -e "${CYAN}${BOLD}           INZEEDO POS - INDUSTRIAL DEPLOYMENT PRO v1.0               ${NC}"
    echo -e "${CYAN}${BOLD}======================================================================${NC}"
}

print_status() { echo -e "${GREEN}[✓]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[!]${NC} $1"; }
print_error() { echo -e "${RED}[✗]${NC} $1"; }
print_info() { echo -e "${BLUE}[i]${NC} $1"; }

# --- 1. Pre-Flight Checks ---
if [ "$EUID" -ne 0 ]; then
  print_error "Please run as root or with sudo."
  exit 1
fi

print_header
print_info "Log file initialized at: $LOG_FILE"

# --- 2. Configuration Prompts ---
echo -e "\n${BOLD}--- Basic Configuration ---${NC}"
read -p "Enter Domain Name (e.g., api.inzeedo.com): " DOMAIN_NAME
read -p "Enter App Port (default 5000): " APP_PORT
APP_PORT=${APP_PORT:-5000}

echo -e "\n${BOLD}--- Mode Selection ---${NC}"
echo -e "1) ${GREEN}Fresh Install${NC} (Build DB from scratch + Seed data)"
echo -e "2) ${BLUE}Update Production${NC} (Run migrations + Live reload)"
read -p "Choose deployment mode (1 or 2): " DEPLOY_MODE

# --- 3. Dependency Installation ---
print_header
print_info "Phase 1: Installing System Dependencies..."

# Update system
apt-get update -y && apt-get upgrade -y

# Install Node.js (v20 LTS recommended)
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Install Nginx & MySQL
apt-get install -y nginx mysql-server certbot python3-certbot-nginx git build-essential

# Install PM2 globally
npm install -g pm2

# --- 4. Database Setup ---
print_info "Phase 2: Database Configuration..."

# 4a. Get Database Credentials
echo -e "\n${BOLD}--- Database Credentials ---${NC}"
read -p "Database Host [localhost]: " DB_HOST
DB_HOST=${DB_HOST:-localhost}
read -p "Database Name [pos_system]: " DB_NAME
DB_NAME=${DB_NAME:-pos_system}
read -p "Database User [pos_user]: " DB_USER
DB_USER=${DB_USER:-pos_user}
read -s -p "Database Password: " DB_PASS
echo ""

# 4b. Environment File Creation
print_status "Configuring .env file..."
cat > .env <<EOF
DB_HOST=$DB_HOST
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASS
NODE_ENV=production
PORT=$APP_PORT
JWT_SECRET=$(openssl rand -base64 32)
REDIS_URL=redis://localhost:6379
EOF

if [[ "$DEPLOY_MODE" == "1" ]]; then
    print_warning "CRITICAL: Fresh Install selected. We need MySQL Admin access to create the database."
    read -p "MySQL Admin User [root]: " ADMIN_USER
    ADMIN_USER=${ADMIN_USER:-root}
    read -s -p "MySQL Admin Password: " ADMIN_PASS
    echo ""

    # Create Database and User
    print_info "Provisioning database '$DB_NAME' and user '$DB_USER'..."
    mysql -u "$ADMIN_USER" -p"$ADMIN_PASS" <<EOF
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\`;
CREATE USER IF NOT EXISTS '$DB_USER'@'$DB_HOST' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'$DB_HOST';
FLUSH PRIVILEGES;
EOF

    if [ $? -eq 0 ]; then
        print_status "Database '$DB_NAME' provisioned successfully."
    else
        print_error "Failed to provision database. Please check your admin credentials."
        exit 1
    fi

    # Run the Industrial Bootstrap
    print_info "Running Industrial Bootstrap (Sync + Seed)..."
    node scripts/bootstrap-db.js | tee -a "$LOG_FILE"
else
    print_info "Running Production Migrations..."
    npx sequelize-cli db:migrate | tee -a "$LOG_FILE"
fi

# --- 5. Nginx Configuration ---
print_info "Phase 3: Configuring Nginx Gateway..."

NGINX_CONF="/etc/nginx/sites-available/$DOMAIN_NAME"

cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    location / {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # Max upload size for images
        client_max_body_size 10M;
    }
}
EOF

ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/"
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# --- 6. SSL Configuration ---
print_info "Phase 4: SSL Integration & Safety Checks..."

# Check if domain is an IP address
if [[ $DOMAIN_NAME =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    print_warning "IP detected ($DOMAIN_NAME). Certbot requires a domain name."
    read -p "Create a self-signed certificate instead? (y/n): " SELF_SIGNED
    if [[ "$SELF_SIGNED" =~ ^[Yy]$ ]]; then
        mkdir -p /etc/ssl/certs
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout /etc/ssl/certs/selfsigned.key \
            -out /etc/ssl/certs/selfsigned.crt \
            -subj "/C=US/ST=State/L=City/O=Organization/CN=$DOMAIN_NAME"
        
        # Update Nginx to use self-signed
        sed -i "s|listen 80;|listen 443 ssl;|" "$NGINX_CONF"
        sed -i "/server_name/a \    ssl_certificate /etc/ssl/certs/selfsigned.crt;\n    ssl_certificate_key /etc/ssl/certs/selfsigned.key;" "$NGINX_CONF"
        systemctl reload nginx
        print_status "Self-signed SSL installed."
    fi
else
    # Domain-based SSL with Certbot logic
    read -p "Do you want to configure Let's Encrypt SSL for $DOMAIN_NAME? (y/n): " RUN_SSL
    if [[ "$RUN_SSL" =~ ^[Yy]$ ]]; then
        # 1. Verify DNS
        print_info "Verifying DNS propagation..."
        PUBLIC_IP=$(curl -s https://ifconfig.me)
        DOMAIN_IP=$(dig +short "$DOMAIN_NAME" | tail -n1)

        if [ "$DOMAIN_IP" != "$PUBLIC_IP" ]; then
            print_warning "DNS mismatch! Domain: $DOMAIN_IP vs Server: $PUBLIC_IP"
            read -p "DNS may not have propagated yet. Try anyway? (y/n): " FORCE_SSL
        else
            FORCE_SSL="y"
        fi

        if [[ "$FORCE_SSL" =~ ^[Yy]$ ]]; then
            # 2. Run Certbot
            # We use --nginx which automatically handles the SSL configuration and redirection
            if certbot --nginx -d "$DOMAIN_NAME" --non-interactive --agree-tos -m admin@$DOMAIN_NAME --redirect; then
                print_status "SSL successfully installed via Certbot (Config updated by Certbot)."
                
                # 3. Add Auto-Renewal Cron
                (crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -
                print_status "Auto-renewal configured."
            else
                print_error "Certbot failed. Please check your DNS and firewall."
            fi
        fi
    fi
fi

# --- 7. Application Start ---
print_info "Phase 5: Launching Backend with PM2..."

APP_NAME="inzeedo-pos-api"

if pm2 list | grep -q "$APP_NAME"; then
    pm2 reload "$APP_NAME"
else
    pm2 start server.js --name "$APP_NAME"
fi

pm2 save
pm2 startup | bash

# --- 8. Done ---
print_header
echo -e "${GREEN}${BOLD}✓ DEPLOYMENT SUCCESSFUL!${NC}"
echo -e "${BLUE}Domain:${NC} https://$DOMAIN_NAME"
echo -e "${BLUE}Port:${NC} $APP_PORT"
echo -e "${BLUE}Status:${NC} Running (PM2)"
echo ""
print_info "View logs anytime with: pm2 logs $APP_NAME"
echo -e "${CYAN}======================================================================${NC}"
