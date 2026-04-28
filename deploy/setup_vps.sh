#!/bin/bash

# --- Inzeedo POS: Master Hybrid Setup Script ---
# Handles System Dependencies, Native MySQL/Redis, Docker API, and SSL.

set -e

echo "----------------------------------------------------"
echo " 🚀 Industrial VPS Setup: Inzeedo POS (Hybrid Mode)"
echo "----------------------------------------------------"

# 1. System Dependency Installation
echo "📦 Checking and installing missing system essentials (Nginx, Redis, Certbot)..."

# Safe function to install only if missing
install_if_missing() {
    if ! command -v $1 &> /dev/null; then
        echo "Installing $1..."
        sudo apt install -y $2
    else
        echo "✅ $1 is already installed. Skipping."
    fi
}

sudo apt update
install_if_missing nginx nginx
install_if_missing redis-server redis-server
install_if_missing certbot certbot
install_if_missing mysql mysql-client

# Special check for docker compose (v2)
if docker compose version &> /dev/null; then
    echo "✅ Docker Compose (V2) is already installed."
else
    echo "⚠️  Warning: Docker Compose (V2) not found. Please ensure it is installed manually to avoid disrupting your other containers."
fi
# 2. Redis Availability Check
echo "⚡ Checking for Redis availability..."
if ss -tuln | grep -q ":6379"; then
    echo "✅ Redis is already active on port 6379. Leveraging existing instance."
else
    echo "Starting Native Redis..."
    sudo systemctl enable redis-server || true
    sudo systemctl start redis-server || true
fi

# 2. Database Provisioning
echo ""
echo "🗄️  Step: Database Provisioning"
read -p "Please enter your Host MySQL Root Password: " DB_ROOT_PASS
echo ""

# Create database if it doesn't exist
mysql -u root -p"$DB_ROOT_PASS" -e "CREATE DATABASE IF NOT EXISTS pos_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" || {
    echo "❌ Error: Could not connect to MySQL. Please check your root password."
    exit 1
}
echo "✅ Database 'pos_system' is ready."

# 3. Environment Configuration
echo ""
echo "🔑 Step: Environment Validation"
if [ ! -f ".env.docker" ]; then
    echo "⚠️  .env.docker not found. Creating from template..."
    cp .env.example .env.docker
    echo "❗ PLEASE EDIT .env.docker now to set your DB_PASSWORD and other secrets."
    exit 1
fi

# 4. Launch the API Container
echo ""
echo "🚢 Step: Launching API (Docker Host Network Mode)"
sudo docker compose up --build -d

# 5. Database Bootstrapping (Migrations & Seeds)
echo ""
echo "🧪 Step: Bootstrapping Database..."
# Wait for API to be ready
echo "Waiting for container to initialize..."
sleep 5
sudo docker compose exec -T api npm run db:bootstrap
echo "✅ Database tables created and seeded with admin user."

# 6. Nginx & SSL Setup
echo ""
echo "🛡️  Step: Nginx & SSL Configuration"
DOMAIN="api-pos.inzeedo.lk"
read -p "Confirm domain for SSL [$DOMAIN]: " USER_DOMAIN
DOMAIN=${USER_DOMAIN:-$DOMAIN}

# Setup Nginx Site
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
if [ ! -f "$NGINX_CONF" ]; then
    echo "Creating Nginx configuration..."
    sudo cp deploy/nginx/vps_host_nginx.conf "$NGINX_CONF"
    sudo ln -s "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/"
fi

echo "Verifying Nginx syntax..."
sudo nginx -t

echo "Obtaining SSL certificate via Certbot..."
sudo certbot --nginx -d "$DOMAIN"

echo "Restarting Nginx..."
sudo systemctl restart nginx

echo ""
echo "----------------------------------------------------"
echo " ✅ SYSTEM FULLY DEPLOYED!"
echo " 🌐 API: https://$DOMAIN/api/v1/health"
echo " 👤 Admin: mrjoon005@gmail.com / admin123"
echo "----------------------------------------------------"
