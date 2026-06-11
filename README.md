<div align="center">
  <h1>Inzeedo ERP - Backend Services</h1>
  <p>The centralized API and core business logic engine for the Inzeedo POS suite.</p>
</div>

---

## 📑 Table of Contents

- [1. Overview & Key Features](#1-overview--key-features)
- [2. Tech Stack & Project Architecture](#2-tech-stack--project-architecture)
- [3. Local Hosting & Development](#3-local-hosting--development)
- [4. Database Migrations & Backups](#4-database-migrations--backups)
- [5. API Documentation](#5-api-documentation)
- [6. Production Deployment (VPS)](#6-production-deployment-vps)
- [7. HTTPS & Load Balancing Strategy](#7-https--load-balancing-strategy)
- [8. CI/CD & Testing Pipelines](#8-cicd--testing-pipelines)
- [9. Monitoring, Logging & Error Handling](#9-monitoring-logging--error-handling)
- [10. Contribution Guidelines](#10-contribution-guidelines)

---

## 1. Overview & Key Features

The **Backend Services** repository houses the core API infrastructure that powers the entire Inzeedo ecosystem. 

### ✨ Key Features
- **Centralized Data Hub**: Single source of truth for POS transactions and business operations.
- **Robust Authentication**: Token-based auth handling multiple client types and RBAC.
- **High-Performance Architecture**: Handles concurrent POS transactions safely.
- **Reporting Engine**: Processes complex aggregate queries for dashboards.
- **Real-Time Sync**: Pushes instant updates to POS terminals via WebSockets.

---

## 2. Tech Stack & Project Architecture

- **Framework**: Node.js / Express (or Next.js API Routes)
- **Database**: PostgreSQL / MySQL
- **ORM**: Prisma / Sequelize
- **Caching**: Redis
- **Authentication**: JWT

### 📂 Directory Structure
We utilize a Service-Controller pattern to ensure business logic is decoupled from HTTP transport layers.

```text
backend/
├── src/
│   ├── config/         # Environment & third-party integrations setup
│   ├── controllers/    # Request/Response handling & input parsing
│   ├── middlewares/    # Auth, Validation, & Error handling middleware
│   ├── models/         # ORM schemas and database definitions
│   ├── routes/         # Express router definitions mapping to controllers
│   ├── services/       # Core business logic (DB calls, complex calculations)
│   ├── sockets/        # WebSocket event listeners and emitters
│   └── utils/          # Shared helpers, logger instances, constants
├── tests/              # Unit and integration test suites
├── package.json
└── bootstrap-db.js     # DB initialization script
```

---

## 3. Local Hosting & Development

### Prerequisites
- **Node.js**: >= 18.x
- **Database**: PostgreSQL/MySQL
- **Redis**: Optional, for caching

### Installation & Configuration
```bash
git clone <repo-url>
cd pos/important/backend
npm install
```

### 🔐 Environment Variables Reference
Create a `.env` file in the root. Below is a comprehensive list of all required and optional flags:

| Variable | Group | Default | Description | Required |
|----------|-------|---------|-------------|----------|
| `APP_PLATFORM` | Server Config | `VPS` | The target platform environment. | Yes |
| `NODE_ENV` | Server Config | `development` | The environment mode (`development` or `production`). | Yes |
| `PORT` | Server Config | `5000` | The port the HTTP server binds to. | Yes |
| `BACKEND_URL` | Server Config | `http://localhost:5000` | The publicly accessible URL of the backend. | Yes |
| `API_VERSION` | Server Config | `v1` | Global API version prefix. | Yes |
| `LOG_LEVEL` | Server Config | `info` | Winston logging level (`info`, `debug`, `error`). | No |
| `DB_HOST` | Database | `127.0.0.1` | Hostname or IP of the database server. | Yes |
| `DB_PORT` | Database | `3306` | Port of the database server. | Yes |
| `DB_NAME` | Database | `pos_system` | Name of the database. | Yes |
| `DB_USER` | Database | `root` | Database user. | Yes |
| `DB_PASSWORD` | Database | - | Database password. | Yes |
| `DB_DIALECT` | Database | `mysql` | Dialect (`mysql`, `postgres`). | Yes |
| `JWT_SECRET` | Authentication | - | Secret key used to sign Access Tokens. | Yes |
| `JWT_EXPIRES_IN` | Authentication | `2h` | Expiration time for Access Tokens. | No |
| `JWT_REFRESH_SECRET` | Authentication | - | Secret key used to sign Refresh Tokens. | Yes |
| `FRONTEND_URL` | CORS | `http://localhost:3000` | Comma-separated list of allowed frontend origins. | Yes |
| `UPLOAD_PATH` | File System | `./uploads` | Local path for storing uploaded files. | Yes |
| `MAX_FILE_SIZE` | File System | `5242880` | Max upload size in bytes (e.g. 5MB). | No |
| `SMTP_HOST` | Email (Primary) | `smtp.gmail.com` | SMTP Server Host for transactional emails. | Yes |
| `SMTP_USER` | Email (Primary) | - | Username for SMTP authentication. | Yes |
| `FALLBACK_EMAIL_API_KEY` | Email (Brevo) | - | Brevo fallback API key if primary SMTP fails. | No |
| `RATE_LIMIT_WINDOW_MS` | Security | `900000` | Time window for rate limiting in ms. | No |
| `RATE_LIMIT_MAX_REQUESTS` | Security | `1000` | Maximum requests allowed within the window. | No |
| `REDIS_URL` | Caching | - | Connection string for Redis caching server. | No |
| `QZ_PRIVATE_KEY` | Hardware | - | PEM formatted private key for QZ Tray integration. | No |

### Database Bootstrap
Run the initialization script to seed the database:
```bash
node bootstrap-db.js
```
> [!WARNING]
> Running this script with the `--force` flag will drop all existing tables. Use with extreme caution.

### Running Locally
```bash
npm run dev
```

---

## 4. Database Migrations & Backups

### Migrations
We manage database schema changes via our ORM. Never modify the database schema directly via SQL.

- **Create a Migration**: `npm run db:migrate:make "migration_name"`
- **Apply Migrations**: `npm run db:migrate`
- **Rollback**: `npm run db:migrate:undo`

### Production Backups
In production, automated backups should be scheduled via `cron`.
Example `pg_dump` backup strategy:
```bash
0 2 * * * pg_dump $DATABASE_URL > /backups/db_backup_$(date +\%F).sql
```

---

## 5. API Documentation

### REST API
All protected routes require an authorization header: `Authorization: Bearer <token>`.
- `POST /api/auth/login` - Authenticate a user.
- `GET /api/inventory/products` - Fetch paginated products.
- `POST /api/sales/transaction` - Submit POS transaction.

---

## 6. Production Deployment (VPS)

### Method 1: Docker & Traefik (Recommended)
Provides automated HTTPS and load balancing out-of-the-box.
1. Define the Backend, DB, and Traefik in `docker-compose.yml`.
2. Apply Traefik Labels to the backend service:
   ```yaml
   labels:
     - "traefik.enable=true"
     - "traefik.http.routers.backend.rule=Host(`api.yourdomain.com`)"
     - "traefik.http.routers.backend.entrypoints=websecure"
     - "traefik.http.routers.backend.tls.certresolver=letsencrypt"
   ```
3. Deploy: `docker-compose up -d --build`

### Method 2: Bare-Metal Setup (PM2)
1. Install Node.js, PM2, and Nginx.
2. Build the project: `npm run build`.
3. Start PM2 in cluster mode to utilize all CPU cores:
   ```bash
   pm2 start npm --name "inzeedo-backend" -i max -- run start
   pm2 save
   ```

---

## 7. HTTPS & Load Balancing Strategy

- **Traefik Scaling**: `docker-compose up -d --scale backend=3`
- **Nginx Config**: If using PM2, configure Nginx as a reverse proxy:
  ```nginx
  upstream backend_cluster {
      server 127.0.0.1:8000;
  }
  server {
      listen 80;
      server_name api.yourdomain.com;
      location / {
          proxy_pass http://backend_cluster;
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection 'upgrade';
      }
  }
  ```
- **Certbot (Nginx SSL)**: `sudo certbot --nginx -d api.yourdomain.com`

---

## 8. CI/CD & Testing Pipelines

We ensure code quality through automated pipelines (GitHub Actions / GitLab CI).

### Testing
Run the test suites locally before pushing:
- **Unit Tests**: `npm run test:unit`
- **Integration Tests**: `npm run test:integration`
- **Coverage Report**: `npm run test:coverage`

### Automated Pipeline Workflow
1. **Lint & Test**: On every PR, the pipeline runs ESLint and Jest suites.
2. **Docker Build**: On merge to `main`, a new Docker image is built and pushed to the registry.
3. **Deploy**: A webhook triggers a rolling restart on the production VPS.

---

## 9. Monitoring, Logging & Error Handling

### Logging
We use structured JSON logging (via Winston/Pino) so logs can be easily parsed by DataDog/ELK stack.
- View local logs: `pm2 logs inzeedo-backend`
- View Docker logs: `docker logs -f backend_container`

### Error Handling
Always use the custom `AppError` class located in `src/utils/AppError.js` to throw errors. This ensures a consistent JSON error response format to the frontend clients.

---

## 10. Contribution Guidelines

- **Branch Naming**: Use `feature/name`, `bugfix/name`, or `hotfix/name`.
- **Commit Messages**: Follow Conventional Commits format (e.g., `feat: added caching to product route`).
- **Code Style**: Ensure you run `npm run lint` and `npm run format` (Prettier) before opening a PR to avoid failing pipeline checks.
