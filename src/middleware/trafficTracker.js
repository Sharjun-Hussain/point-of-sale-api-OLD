const redisService = require('../services/redisService');

/**
 * TRAFFIC TRACKER MIDDLEWARE
 * Increments an atomic counter in Redis for every incoming request.
 * This allows the maintenance service to calculate real-time throughput.
 */
const trafficTracker = async (req, res, next) => {
    // Only track successful API requests to keep metrics clean
    // We increment a global request counter in Redis
    if (redisService.isConnected) {
        try {
            // Atomic increment of the request counter
            await redisService.client.incr('pos:traffic:requests');
            
            // We could also track bandwidth if needed by summing Content-Length
            const contentLength = parseInt(req.headers['content-length'] || 0);
            if (contentLength > 0) {
                await redisService.client.incrby('pos:traffic:bytes_in', contentLength);
            }
        } catch (err) {
            // Silently fail to not block the request
        }
    }
    next();
};

module.exports = trafficTracker;
