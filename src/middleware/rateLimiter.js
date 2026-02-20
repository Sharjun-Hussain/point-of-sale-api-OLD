const { RateLimiterMySQL } = require('rate-limiter-flexible');
const mysql = require('mysql2');

// Connection configuration for the rate limiter
// Note: RateLimiterMySQL works best with the callback-based mysql2 client
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

// Create rate limiter
const rateLimiter = new RateLimiterMySQL({
    storeClient: pool,
    dbName: process.env.DB_NAME || 'pos_system',
    tableName: 'rate_limits',
    storeType: 'pool', // Explicitly specify the store type
    points: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // Number of requests
    duration: parseInt(process.env.RATE_LIMIT_WINDOW_MS) / 1000 || 900, // Per 15 minutes (in seconds)
    tableCreated: false, // It will try to create the table if it's not created yet
});

const rateLimiterMiddleware = async (req, res, next) => {
    try {
        // Use IP address as key
        const key = req.ip || req.connection.remoteAddress;

        await rateLimiter.consume(key);
        next();
    } catch (rejRes) {
        // If it's a rate limit error (rejRes is an object with msBeforeNext)
        if (rejRes.msBeforeNext !== undefined) {
            res.status(429).json({
                status: 'error',
                message: 'Too many requests, please try again later.',
                retryAfter: Math.ceil(rejRes.msBeforeNext / 1000)
            });
        } else {
            // If it's a database error or something else, log it and let the request through
            // We don't want to block users if the rate limit table is down
            console.error('Rate Limiter Error:', rejRes);
            next();
        }
    }
};

module.exports = rateLimiterMiddleware;
