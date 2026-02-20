const { RateLimiterMySQL } = require('rate-limiter-flexible');
const mysql = require('mysql2');

let rateLimiter = null;

// Use a separate pool for the rate limiter to avoid blocking the main app pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pos_system',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0
});

const initRateLimiter = () => {
    if (rateLimiter) return rateLimiter;

    try {
        rateLimiter = new RateLimiterMySQL({
            storeClient: pool,
            dbName: process.env.DB_NAME || 'pos_system',
            tableName: 'rate_limits',
            storeType: 'pool',
            points: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
            duration: (parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000) / 1000,
            tableCreated: false,
        });

        // Catch initial connection/table creation errors to prevent unhandled rejections
        // Note: internal errors in RateLimiterMySQL are usually swallowed or logged
        // but it doesn't have a specific .on('error') for the instance itself.
        // The pool handles its own errors.

        return rateLimiter;
    } catch (err) {
        console.error('Rate Limiter Initialization Error:', err);
        return null;
    }
};

const rateLimiterMiddleware = async (req, res, next) => {
    const limiter = initRateLimiter();

    if (!limiter) {
        // If DB is not ready yet, just skip rate limiting for now
        return next();
    }

    try {
        const key = req.ip || req.connection.remoteAddress;
        await limiter.consume(key);
        next();
    } catch (rejRes) {
        if (rejRes instanceof Error) {
            // DB Error or similar
            console.error('Rate Limiter Error:', rejRes.message);
            next();
        } else if (rejRes.msBeforeNext !== undefined) {
            // Rate limit triggered
            res.status(429).json({
                status: 'error',
                message: 'Too many requests, please try again later.',
                retryAfter: Math.ceil(rejRes.msBeforeNext / 1000)
            });
        } else {
            next();
        }
    }
};

module.exports = rateLimiterMiddleware;
