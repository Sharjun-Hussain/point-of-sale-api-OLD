const { RateLimiterMemory } = require('rate-limiter-flexible');

// Create rate limiter
const rateLimiter = new RateLimiterMemory({
    points: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // Number of requests
    duration: parseInt(process.env.RATE_LIMIT_WINDOW_MS) / 1000 || 900, // Per 15 minutes (in seconds)
});

const rateLimiterMiddleware = async (req, res, next) => {
    try {
        // Use IP address as key
        const key = req.ip || req.connection.remoteAddress;

        await rateLimiter.consume(key);
        next();
    } catch (rejRes) {
        res.status(429).json({
            status: 'error',
            message: 'Too many requests, please try again later.',
            retryAfter: Math.ceil(rejRes.msBeforeNext / 1000)
        });
    }
};

module.exports = rateLimiterMiddleware;
