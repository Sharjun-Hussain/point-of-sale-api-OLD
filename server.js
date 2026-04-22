require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');

// Import database
const db = require('./src/config/database');

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
const cron = require('node-cron');
const maintenanceService = require('./src/services/maintenanceService');

// Initialize Express app
const app = express();

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
    'http://localhost:8100',      // Ionic/Capacitor livereload
    'capacitor://localhost',      // Capacitor iOS
    'ionic://localhost',          // Ionic iOS
    'http://10.0.2.2',           // Android emulator → host machine
    'http://10.0.2.2:3000',
    'http://127.0.0.1',
    'http://127.0.0.1:3000',
    // Production frontend(s)
    'https://pos.inzeedo.com',
    'http://pos.inzeedo.com',
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
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "img-src": ["'self'", "data:", process.env.BACKEND_URL || "http://localhost:5000", "https://images.unsplash.com"],
        },
    },
}));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
            // Test database connection
            await db.authenticate();
            logger.info('✅ Database connection established successfully.');

            /* 
            // Sync database (in development only)
            if (process.env.NODE_ENV === 'development') {
                await db.sync({ alter: false });
                logger.info('✅ Database synchronized.');
            }
            */

            // Start scheduled jobs
            await scheduleSubscriptionCheck();
            await scheduleExpiryWatcher();

            // Telemetry: Record system metrics every minute
            await maintenanceService.recordSystemMetrics(); // Initial point on boot
            cron.schedule('* * * * *', async () => {
                await maintenanceService.recordSystemMetrics();
            });

            // Start server
            server = app.listen(PORT, () => {
                logger.info(`🚀 Server running on port ${PORT}`);
                logger.info(`📍 Environment: ${process.env.NODE_ENV}`);
                logger.info(`🔗 API Base URL: ${process.env.BACKEND_URL || `http://localhost:${PORT}`}/api/${process.env.API_VERSION || 'v1'}`);
            });

            // If we successfully started everything, break the retry loop
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
        await db.close();
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
