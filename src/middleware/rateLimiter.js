const { RateLimiterRedis, RateLimiterMySQL } = require('rate-limiter-flexible');
const mysql = require('mysql2');
const redisService = require('../services/redisService');

let rateLimiter = null;

// Use a separate pool for the MySQL fallback rate limiter
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
        const points = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;
        const durationSeconds = (parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000) / 1000;

        // HIGH-PERFORMANCE: Use Redis if REDIS_URL is configured
        if (process.env.REDIS_URL && redisService.client) {
            rateLimiter = new RateLimiterRedis({
                storeClient: redisService.client,
                keyPrefix: 'middleware',
                points: points,
                duration: durationSeconds,
            });
            console.log('⚡ Rate Limiter: Using High-Speed Redis Engine');
        } else {
            // FALLBACK: Use MySQL if Redis is offline
            rateLimiter = new RateLimiterMySQL({
                storeClient: pool,
                dbName: process.env.DB_NAME || 'pos_system',
                tableName: 'rate_limits_fallback',
                storeType: 'pool',
                points: points,
                duration: durationSeconds,
                tableCreated: true, // Prevents the Table Not Created Error
            });
            console.log('⚠️ Rate Limiter: Using MySQL Fallback Engine');
        }

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
