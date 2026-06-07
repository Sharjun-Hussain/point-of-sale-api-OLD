require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

// Import models
const db = require('./src/models');
const mysql = require('mysql2/promise');
const masterSeed = require('./src/seeders/masterSeed');

// Import routes
const routes = require('./src/routes');

// Import logger
const logger = require('./src/utils/logger');

// Import middleware
const errorHandler = require('./src/middleware/errorHandler');
const rateLimiter = require('./src/middleware/rateLimiter');

// Import scheduled jobs
const { scheduleSubscriptionCheck } = require('./src/jobs/subscriptionScheduler');
const { scheduleExpiryWatcher } = require('./src/jobs/expiryWatcher');
const { scheduleInventoryWatcher } = require('./src/jobs/inventoryWatcher');
const { scheduleBackupJob } = require('./src/jobs/backupScheduler');
const cron = require('node-cron');
const maintenanceService = require('./src/services/maintenanceService');

// Initialize Express app
const app = express();

// TRUST PROXY: Required for production when behind a reverse proxy (Nginx)
// This ensures req.ip reflects the real client IP, not 127.0.0.1
app.set('trust proxy', 1);

// CORS configuration - MUST BE FIRST
// Production origins from env (comma-separated)
const envOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(o => o.trim().replace(/\/$/, ""))
    : [];

// Mobile & development origins - ALWAYS allowed, regardless of environment.
// Native Capacitor/Android apps send no origin at all (handled below),
// but local dev servers and web-based testing do send these origins.
const alwaysAllowedOrigins = [
    'http://localhost',           // Capacitor Android local
    'http://localhost:3000',      // Next.js dev server
    'http://localhost:5000',      // Electron Desktop local
    'http://localhost:8100',      // Ionic/Capacitor livereload
    'https://localhost',          // Capacitor HTTPS scheme
    'https://localhost:3000',
    'https://localhost:5000',
    'https://localhost:8100',
    'capacitor://localhost',      // Capacitor iOS
    'ionic://localhost',          // Ionic iOS
    'http://10.0.2.2',           // Android emulator → host machine
    'http://10.0.2.2:3000',
    'https://10.0.2.2',
    'https://10.0.2.2:3000',
    'http://127.0.0.1',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000',
    'https://127.0.0.1',
    'https://127.0.0.1:3000',
    'https://127.0.0.1:5000',
    // Production frontend(s)
    'https://pos.inzeedo.lk',
    'http://pos.inzeedo.lk',
    'https://pos-frontend-old-v2.vercel.app',
    'http://pos-frontend-old-v2.vercel.app'
];

// Merge: env overrides + static whitelist, deduplicated
const allAllowedOrigins = [...new Set([...envOrigins, ...alwaysAllowedOrigins])];

logger.info(`[CORS] Allowed origins: ${allAllowedOrigins.join(', ')}`);

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin header (native mobile apps, curl, Postman)
        if (!origin) return callback(null, true);

        // Normalize origin for comparison (strip trailing slash)
        const normalizedOrigin = origin.replace(/\/$/, "");

        if (allAllowedOrigins.includes(normalizedOrigin)) {
            callback(null, true);
        } else {
            logger.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
            callback(new Error('Not allowed by CORS'), false);
        }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'X-Branch-Id',   // Custom header for POS branch management
        'Cache-Control',
        'Pragma'
    ]
};
app.use(cors(corsOptions));

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: (process.env.APP_PLATFORM === 'DESKTOP' || process.env.ELECTRON_RUNNING === 'true') 
        ? false // Disable strict CSP on desktop to allow Next.js inline scripts
        : {
            directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                "img-src": ["'self'", "data:", process.env.BACKEND_URL || "http://localhost:5000", "https://images.unsplash.com"],
            },
        },
}));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Traffic Analysis Middleware
const trafficTracker = require('./src/middleware/trafficTracker');
app.use(trafficTracker);

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev', { stream: logger.stream }));
} else {
    app.use(morgan('combined', { stream: logger.stream }));
}

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve Frontend Static Files (for Desktop/Electron mode)
if (process.env.APP_PLATFORM === 'DESKTOP' || process.env.ELECTRON_RUNNING === 'true') {
    const frontendPath = path.join(__dirname, '../frontend');
    const devFrontendPath = path.join(__dirname, '../electron-desktop/out');
    
    const finalPath = fs.existsSync(frontendPath) ? frontendPath : devFrontendPath;
    
    if (fs.existsSync(finalPath)) {
        logger.info(`🌐 Serving frontend from: ${finalPath}`);
        app.use(express.static(finalPath));
        
        // Handle SPA routing (redirect only Page requests to index.html)
        app.use((req, res, next) => {
            // Only handle GET requests that are NOT:
            // 1. API calls (/api)
            // 2. File uploads (/uploads)
            // 3. Static assets (/_next)
            // 4. Files with extensions (contains a dot)
            const isPageRequest = req.method === 'GET' && 
                                 !req.path.startsWith('/api') && 
                                 !req.path.startsWith('/_next') &&
                                 !req.path.startsWith('/uploads') &&
                                 !req.path.includes('.');

            if (isPageRequest) {
                res.sendFile(path.join(finalPath, 'index.html'));
            } else {
                next();
            }
        });
    }
}

// Rate limiting
app.use(rateLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
    });
});

// API routes
app.use(`/api/${process.env.API_VERSION || 'v1'}`, routes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        message: 'Route not found'
    });
});

// Global error handler
app.use(errorHandler);

// Database connection and server start
const PORT = process.env.PORT || 5000;
let server;

const startServer = async () => {
    const maxAttempts = parseInt(process.env.DB_RETRY_ATTEMPTS || '5');
    const delay = parseInt(process.env.DB_RETRY_DELAY || '5000');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            logger.info(`Attempting to connect to database... (Attempt ${attempt}/${maxAttempts})`);
            
            // On desktop, try to create the database if it doesn't exist
            if (process.env.ELECTRON_RUNNING === 'true' || process.env.APP_PLATFORM === 'DESKTOP') {
                try {
                    const connection = await mysql.createConnection({
                        host: process.env.DB_HOST || '127.0.0.1',
                        port: process.env.DB_PORT || 3306,
                        user: process.env.DB_USER || 'root',
                        password: process.env.DB_PASSWORD || ''
                    });
                    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'pos_system'}\`;`);
                    await connection.end();
                    logger.info(`✅ Database verified/created: ${process.env.DB_NAME || 'pos_system'}`);
                } catch (dbError) {
                    logger.warn(`⚠️  Could not auto-create database (MySQL might not be running or credentials wrong): ${dbError.message}`);
                    // We continue, Sequelize will fail and trigger retry if it's a connection issue
                }
            }

            // 1. Start server immediately so Electron doesn't timeout
            // We only start the listener ONCE. Even if DB is down, the server stays alive 
            // and retries the connection in the background.
            if (!server) {
                server = app.listen(PORT, () => {
                    logger.info(`🚀 Server listening on port ${PORT} (Initialization in progress...)`);
                });
            }

            // 2. Test database connection
            await db.sequelize.authenticate();
            logger.info('✅ Database connection established successfully.');

            // 3. Auto-Sync and Seed for Desktop Mode (in background)
            if (process.env.APP_PLATFORM === 'DESKTOP' || process.env.ELECTRON_RUNNING === 'true') {
                logger.info('🖥️  Desktop mode: Initializing database tables...');
                try {
                    await db.sequelize.sync({ alter: false });
                    logger.info('✅ Database tables initialized.');
                } catch (syncError) {
                    logger.warn(`⚠️ Non-fatal Database Sync Error: ${syncError.message}`);
                    logger.warn('⚠️ Proceeding with existing database schema...');
                }

                const userCount = await db.User.count();
                if (userCount === 0) {
                    logger.info('🆕 Fresh installation detected. Bootstrapping initial data...');
                    await masterSeed({ exitOnComplete: false });
                    logger.info('✅ Master data (Admin, Roles, Permissions) seeded successfully.');
                }
            }

            // 4. Start scheduled jobs
            await scheduleSubscriptionCheck();
            await scheduleExpiryWatcher();
            await scheduleInventoryWatcher();
            await scheduleBackupJob();

            // 5. Telemetry: Record system metrics every 30 seconds
            await maintenanceService.recordSystemMetrics(); // Initial point on boot
            cron.schedule('*/30 * * * * *', async () => {
                await maintenanceService.recordSystemMetrics();
            });

            logger.info('🏁 System fully ready.');
            return;

        } catch (error) {
            logger.error(`❌ Attempt ${attempt}/${maxAttempts} failed: ${error.message}`);

            if (attempt === maxAttempts) {
                logger.error('CRITICAL: Max database connection attempts reached. Exiting...');
                process.exit(1);
            }

            logger.info(`Retrying in ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

// Graceful Shutdown function
const gracefulShutdown = async (signal) => {
    logger.info(`\n${signal} received. Starting graceful shutdown...`);

    if (server) {
        // 1. Stop accepting new requests
        server.close(() => {
            logger.info('HTTP server closed.');
        });
    }

    try {
        // 2. Close database connections
        await db.sequelize.close();
        logger.info('Database connection closed.');

        // 3. Exit process successfully
        logger.info('Graceful shutdown completed.');
        process.exit(0);
    } catch (err) {
        logger.error('Error during shutdown:', err);
        process.exit(1);
    }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    logger.error('UNHANDLED REJECTION! 💥 Shutting down...', err);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...', err);
    process.exit(1);
});

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the server only if we are not in a test environment
if (process.env.NODE_ENV !== 'test') {
    startServer().catch(err => {
        logger.error('CRITICAL: Failed to start server:', err);
        process.exit(1);
    });
}

module.exports = app;
