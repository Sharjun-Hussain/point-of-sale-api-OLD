#!/bin/bash

# Navigate to the script's directory
cd "$(dirname "$0")"

# Load environment variables from .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
else
  echo ".env file not found! Please create one."
  exit 1
fi

echo "Deploying Backend..."

# Check for pnpm, fallback to npm
if command -v pnpm &> /dev/null; then
  PKG_MANAGER="pnpm"
else
  PKG_MANAGER="npm"
fi

echo "Using $PKG_MANAGER for installation..."

# Install dependencies
echo "Installing dependencies..."
$PKG_MANAGER install

# Wait a moment for installation to finalize
sleep 2

# Create Database and Run Migrations
echo "Setting up Database '$DB_NAME'..."

# Create DB (if it doesn't exist)
# Using sequelize-cli if available in scripts, otherwise manual mysql creation is a fallback option but package.json has scripts.
echo "Creating database..."
if [ "$PKG_MANAGER" = "pnpm" ]; then
    pnpm run db:create
else
    npm run db:create
fi

# Run Migrations
echo "Running migrations..."
if [ "$PKG_MANAGER" = "pnpm" ]; then
    pnpm run db:migrate
else
    npm run db:migrate
fi

# Seed Database (Optional - uncomment if needed)
# echo "Seeding database..."
# if [ "$PKG_MANAGER" = "pnpm" ]; then
#     pnpm run db:seed
# else
#     npm run db:seed
# fi

echo "Database setup complete."

# Start the Server
echo "Starting Backend Server..."
# Using pm2 if available, otherwise standard start
if command -v pm2 &> /dev/null; then
  pm2 start server.js --name "pos-backend"
  echo "Backend started with PM2."
else
  echo "PM2 not found. Starting with $PKG_MANAGER run start..."
  if [ "$PKG_MANAGER" = "pnpm" ]; then
      pnpm run start
  else
      npm run start
  fi
fi
