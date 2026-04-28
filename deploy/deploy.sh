#!/bin/bash

# --- Industrial POS: Professional Deployment Script ---
# This script automates the full update cycle on your VPS.

set -e # Exit immediately if a command exits with a non-zero status

# 📂 Configuration
PROJECT_DIR="$(pwd)"
ENV_FILE=".env.docker"
BACKEND_CONTAINER="pos_api"

echo "🚀 Starting local-build deployment for Inzeedo POS..."

# 1. Verify Environment
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: $ENV_FILE not found! Please create it before deploying."
    exit 1
fi

# 3. Build and Launch Containers
echo "🏗️  Building and starting containers..."
docker compose up --build -d

# 4. Wait for API to be ready
echo "⏳ Waiting for API to initialize..."
sleep 10

# 5. Database Maintenance (Optional - Uncomment if using Sequelize migrations)
# echo "🗄️ Running database migrations..."
# docker compose exec -T api npm run db:migrate

# 6. Cleanup old images (Saves VPS Disk Space)
echo "🧹 Cleaning up unused Docker images..."
docker image prune -f

# 7. Health Check
echo "🔍 Performing health check..."
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/v1/health || echo "FAILED")

if [ "$HEALTH_STATUS" == "200" ]; then
    echo "✅ Deployment Successful! API is healthy at https://api-pos.inzeedo.lk"
else
    echo "⚠️  Deployment finished but health check failed (Status: $HEALTH_STATUS)."
    echo "📑 Check logs with: docker compose logs -f api"
fi

echo "🏁 Done."
