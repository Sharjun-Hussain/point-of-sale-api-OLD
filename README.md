<div align="center">
  <h1>Inzeedo ERP - Backend Services</h1>
  <p>The centralized API and core business logic engine for the Inzeedo POS suite.</p>
</div>

---

## 📖 Overview

The **Backend Services** repository houses the core API infrastructure that powers the entire Inzeedo ecosystem, including the Web Client, Desktop/Electron apps, and Mobile applications. It manages secure data transactions, authentication, complex financial calculations, and robust inventory synchronization.

## ⚡ Key Features

- **Centralized Data Hub**: Single source of truth for all POS transactions, user management, and business operations.
- **Robust Authentication**: Secure, token-based authentication handling multiple client types and RBAC (Role-Based Access Control) permissions.
- **High-Performance Architecture**: Built to handle concurrent point-of-sale transactions efficiently without data collisions.
- **Hardware Integrations API**: Provides endpoints tailored for hardware synchronization and receipt generation metrics.
- **Reporting Engine**: Processes complex aggregate queries for the financial and sales reporting dashboards.

## 🛠 Tech Stack

- **Framework**: Node.js / Express (or Next.js API Routes)
- **Database**: PostgreSQL / MySQL
- **ORM**: Prisma / Sequelize
- **Caching**: Redis
- **Authentication**: JWT / NextAuth compatibility

---

## 🚀 Getting Started (Local Hosting & Development)

### Prerequisites
- Node.js >= 18.x
- Database Engine (PostgreSQL/MySQL) running locally or via Docker
- Redis (Optional, for caching and rate-limiting)

### Installation

1. Clone the repository and navigate to the `backend` directory:
   ```bash
   cd pos/important/backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Configuration
Create a `.env` file in the root of the `backend` directory:
```env
PORT=8000
DATABASE_URL="postgresql://user:password@localhost:5432/inzeedo_db?schema=public"
JWT_SECRET="your_jwt_secret"
NODE_ENV="development"
```

### Database Bootstrap (`bootstrap-db.js` Usage)
Before running the application, you must initialize the database schema and populate it with essential seed data (default admin accounts, initial system settings, and essential roles).

Run the bootstrap script:
```bash
node bootstrap-db.js
```
*Note: This script will drop existing tables if run with a `--force` flag. Ensure you are using it carefully in development environments.*

### Running Locally
Start the development server with hot-reloading:
```bash
npm run dev
```
The API will be available at `http://localhost:8000`.

---

## 📡 API Usage Overview

The backend exposes a RESTful API (or GraphQL, depending on the route configuration) to handle ERP functions.

### Authentication
All protected routes require an authorization header:
```http
Authorization: Bearer <your_jwt_token>
```

### Example Endpoints
- `POST /api/auth/login` - Authenticate a user and receive a token.
- `GET /api/inventory/products` - Fetch the product catalog (supports pagination, filtering).
- `POST /api/sales/transaction` - Submit a new POS transaction.
- `GET /api/reports/daily-sales` - Retrieve aggregated sales data for dashboards.

---

## 🌍 Production Deployment (VPS Hosting)

The backend is designed to be highly available. We provide two primary methods for deploying the backend to a Virtual Private Server (VPS): **Docker with Traefik** (Recommended) or a **Standard PM2 + Nginx** setup.

### Method 1: Docker & Traefik (Recommended)
This approach provides automated HTTPS certificates via Let's Encrypt and seamless load balancing out-of-the-box.

1. **Install Docker & Docker Compose** on your VPS.
2. Create a `docker-compose.yml` defining the Backend, Database, Redis, and Traefik router.
3. **Traefik Configuration Labels**: Ensure the backend container includes the following labels for routing and SSL:
   ```yaml
   labels:
     - "traefik.enable=true"
     - "traefik.http.routers.backend.rule=Host(`api.yourdomain.com`)"
     - "traefik.http.routers.backend.entrypoints=websecure"
     - "traefik.http.routers.backend.tls.certresolver=letsencrypt"
     - "traefik.http.services.backend.loadbalancer.server.port=8000"
   ```
4. **Deploy**:
   ```bash
   docker-compose up -d --build
   ```
5. **Load Balancing**: To scale the backend instances with Traefik, simply use Docker Compose scaling:
   ```bash
   docker-compose up -d --scale backend=3
   ```
   Traefik will automatically round-robin traffic between the 3 containers.

---

### Method 2: Normal Installation (PM2 + Nginx)
For traditional bare-metal or VPS deployments without Docker.

#### 1. Setup & Build
1. Install Node.js, PM2, and Nginx on your VPS.
2. Clone the repo, `npm install`, and run `npm run build`.
3. Bootstrap the production database: `NODE_ENV=production node bootstrap-db.js`.

#### 2. Process Management (PM2)
Start the application in cluster mode to utilize all CPU cores and act as a local load balancer:
```bash
pm2 start npm --name "inzeedo-backend" -i max -- run start
pm2 save
pm2 startup
```

#### 3. Nginx Configuration & Load Balancing
Configure Nginx to act as a reverse proxy. If you are running multiple instances across different ports or servers, you can define an `upstream` block.

Create `/etc/nginx/sites-available/api.yourdomain.com`:
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
Enable the site:
```bash
ln -s /etc/nginx/sites-available/api.yourdomain.com /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

#### 4. HTTPS Setup (Certbot)
Secure the Nginx server using Let's Encrypt:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```
Certbot will automatically modify your Nginx configuration to redirect HTTP to HTTPS and install the SSL certificates.
