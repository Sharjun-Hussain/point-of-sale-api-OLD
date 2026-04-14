#!/bin/bash

# --- Inzeedo POS: Master Hybrid Setup Script ---
# Handles System Dependencies, Native MySQL/Redis, Docker API, and SSL.

set -e

echo "----------------------------------------------------"
echo " 🚀 Industrial VPS Setup: Inzeedo POS (Hybrid Mode)"
echo "----------------------------------------------------"

# 1. System Dependency Installation
echo "📦 Installing system essentials (Nginx, Redis, Certbot)..."
sudo apt update
sudo apt install -y nginx redis-server certbot python3-certbot-nginx mysql-client docker-compose-v2

# Start Redis natively
echo "⚡ Starting Native Redis..."
sudo systemctl enable redis-server
sudo systemctl start redis-server

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
DOMAIN="api-pos.inzeedo.com"
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
