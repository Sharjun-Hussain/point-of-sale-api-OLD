<div align="center">
  <h1>Inzeedo ERP - Backend Services</h1>
  <p>The centralized API and core business logic engine for the Inzeedo POS suite.</p>
</div>

---

## 📑 Table of Contents

- [1. Overview & Key Features](#1-overview--key-features)
- [2. Tech Stack & Architecture](#2-tech-stack--architecture)
- [3. Local Hosting & Development](#3-local-hosting--development)
  - [Prerequisites](#prerequisites)
  - [Installation & Configuration](#installation--configuration)
  - [Database Bootstrap](#database-bootstrap)
  - [Running Locally](#running-locally)
- [4. API Documentation](#4-api-documentation)
  - [Authentication](#authentication)
  - [Example Endpoints](#example-endpoints)
- [5. Production Deployment (VPS)](#5-production-deployment-vps)
  - [Method 1: Docker & Traefik (Recommended)](#method-1-docker--traefik-recommended)
  - [Method 2: Bare-Metal Setup (PM2 & Nginx)](#method-2-bare-metal-setup-pm2--nginx)
- [6. HTTPS & Load Balancing Strategy](#6-https--load-balancing-strategy)

---

## 1. Overview & Key Features

The **Backend Services** repository houses the core API infrastructure that powers the entire Inzeedo ecosystem (Web Client, Desktop/Electron apps, and Mobile applications). 

### ✨ Key Features
- **Centralized Data Hub**: Single source of truth for all POS transactions, user management, and business operations.
- **Robust Authentication**: Secure, token-based authentication handling multiple client types and RBAC (Role-Based Access Control) permissions.
- **High-Performance Architecture**: Built to handle concurrent point-of-sale transactions efficiently without data collisions.
- **Hardware Integrations API**: Provides endpoints tailored for hardware synchronization and receipt generation metrics.
- **Reporting Engine**: Processes complex aggregate queries for the financial and sales reporting dashboards.

---

## 2. Tech Stack & Architecture

- **Framework**: Node.js / Express (or Next.js API Routes)
- **Database**: PostgreSQL / MySQL
- **ORM**: Prisma / Sequelize
- **Caching**: Redis
- **Authentication**: JWT / NextAuth compatibility

---

## 3. Local Hosting & Development

### Prerequisites
- **Node.js**: >= 18.x
- **Database**: PostgreSQL/MySQL running locally or via Docker
- **Redis**: Optional, for caching and rate-limiting

### Installation & Configuration

1. **Clone the repository** and navigate to the backend directory:
   ```bash
   cd pos/important/backend
   npm install
   ```

2. **Configure Environment Variables**: Create a `.env` file in the root of the `backend` directory.
   ```env
   PORT=8000
   DATABASE_URL="postgresql://user:password@localhost:5432/inzeedo_db?schema=public"
   JWT_SECRET="your_jwt_secret"
   NODE_ENV="development"
   ```

### Database Bootstrap
Before running the application, you must initialize the database schema and populate it with essential seed data (default admin accounts, system settings, and essential roles).

Run the bootstrap script:
```bash
node bootstrap-db.js
```
> [!WARNING]
> This script will drop existing tables if run with a `--force` flag. Ensure you are using it carefully in development environments.

### Running Locally
Start the development server with hot-reloading:
```bash
npm run dev
```
The API will be available at `http://localhost:8000`.

---

## 4. API Documentation

The backend exposes a RESTful API to handle ERP functions.

### Authentication
All protected routes require an authorization header containing a valid JWT token:
```http
Authorization: Bearer <your_jwt_token>
```

### Example Endpoints
- `POST /api/auth/login` - Authenticate a user and receive a token.
- `GET /api/inventory/products` - Fetch the product catalog (supports pagination, filtering).
- `POST /api/sales/transaction` - Submit a new POS transaction.
- `GET /api/reports/daily-sales` - Retrieve aggregated sales data for dashboards.

---

## 5. Production Deployment (VPS)

The backend is designed to be highly available. We provide two primary methods for deploying the backend to a Virtual Private Server (VPS).

### Method 1: Docker & Traefik (Recommended)
This approach provides automated HTTPS certificates via Let's Encrypt and seamless load balancing out-of-the-box.

1. **Install Requirements**: Ensure Docker & Docker Compose are installed on your VPS.
2. **Docker Compose Setup**: Define the Backend, Database, Redis, and Traefik router in `docker-compose.yml`.
3. **Traefik Configuration Labels**: Ensure the backend container includes the following routing and SSL labels:
   ```yaml
   labels:
     - "traefik.enable=true"
     - "traefik.http.routers.backend.rule=Host(`api.yourdomain.com`)"
     - "traefik.http.routers.backend.entrypoints=websecure"
     - "traefik.http.routers.backend.tls.certresolver=letsencrypt"
     - "traefik.http.services.backend.loadbalancer.server.port=8000"
   ```
4. **Deploy Application**:
   ```bash
   docker-compose up -d --build
   ```

### Method 2: Bare-Metal Setup (PM2 & Nginx)
For traditional deployments without Docker.

1. **Install Requirements**: Install Node.js, PM2, and Nginx on your VPS.
2. **Build the Project**: Run `npm install` and `npm run build`.
3. **Bootstrap Production DB**: `NODE_ENV=production node bootstrap-db.js`
4. **Start with PM2**: Run the application in cluster mode to utilize all CPU cores.
   ```bash
   pm2 start npm --name "inzeedo-backend" -i max -- run start
   pm2 save
   pm2 startup
   ```

---

## 6. HTTPS & Load Balancing Strategy

### Scaling with Traefik (Method 1)
To scale the backend instances with Traefik, simply use Docker Compose scaling. Traefik will automatically round-robin traffic between the containers.
```bash
docker-compose up -d --scale backend=3
```

### Scaling with Nginx & Certbot (Method 2)
If you used the bare-metal setup, configure Nginx to act as a reverse proxy and load balancer.

1. **Create Nginx Configuration**: `/etc/nginx/sites-available/api.yourdomain.com`:
   ```nginx
   upstream backend_cluster {
       # PM2 handles local clustering, but if you have multiple VPS nodes:
       server 127.0.0.1:8000;
       # server 10.0.0.2:8000; # Add secondary nodes here
   }

   server {
       listen 80;
       server_name api.yourdomain.com;

       location / {
           proxy_pass http://backend_cluster;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           
           # Real IP Forwarding
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_addres_forwarded_for;
       }
   }
   ```
2. **Enable and Restart**:
   ```bash
   ln -s /etc/nginx/sites-available/api.yourdomain.com /etc/nginx/sites-enabled/
   nginx -t
   systemctl restart nginx
   ```
3. **Secure with Let's Encrypt**:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d api.yourdomain.com
   ```
   Certbot will automatically install the SSL certificates and redirect HTTP traffic to HTTPS.
