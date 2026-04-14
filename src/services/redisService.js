const Redis = require('ioredis');
const logger = require('../utils/logger');

/**
 * INDUSTRIAL REDIS SERVICE
 * Handles high-performance caching for heavy queries and dashboard metrics.
 */
class RedisService {
    constructor() {
        this.client = null;
        this.isConnected = false;

        // Initialize connection if URL is provided
        if (process.env.REDIS_URL) {
            this.client = new Redis(process.env.REDIS_URL, {
                maxRetriesPerRequest: 3,
                retryStrategy(times) {
                    const delay = Math.min(times * 50, 2000);
                    return delay;
                }
            });

            this.client.on('connect', () => {
                this.isConnected = true;
                logger.info('✅ Redis connection established.');
            });

            this.client.on('error', (err) => {
                this.isConnected = false;
                logger.error('❌ Redis error:', err.message);
            });
        }
    }

    /**
     * Set a value in the cache with a time-to-live (TTL).
     */
    async set(key, value, ttl = 300) {
        if (!this.isConnected) return null;
        try {
            const data = JSON.stringify(value);
            return await this.client.set(key, data, 'EX', ttl);
        } catch (error) {
            logger.error(`Redis set error for key ${key}:`, error.message);
            return null;
        }
    }

    /**
     * Get a value from the cache.
     */
    async get(key) {
        if (!this.isConnected) return null;
        try {
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error(`Redis get error for key ${key}:`, error.message);
            return null;
        }
    }

    /**
     * Delete a specific key from the cache.
     */
    async del(key) {
        if (!this.isConnected) return null;
        return await this.client.del(key);
    }

    /**
     * Completely flush the Redis database.
     */
    async flush() {
        if (!this.isConnected) return null;
        return await this.client.flushdb();
    }

    /**
     * Fetch real-time Redis stats (Memory used, Key counts).
     */
    async getStats() {
        if (!this.isConnected) return { status: 'offline' };
        
        try {
            const info = await this.client.info();
            const memoryMatch = info.match(/used_memory_human:(\S+)/);
            const clientsMatch = info.match(/connected_clients:(\d+)/);
            const keysMatch = info.match(/keys=(\d+)/);

            return {
                status: 'online',
                memoryUsed: memoryMatch ? memoryMatch[1] : '0B',
                connectedClients: clientsMatch ? clientsMatch[1] : '0',
                keyCount: keysMatch ? keysMatch[1] : '0'
            };
        } catch (error) {
            return { status: 'error', message: error.message };
        }
    }
}

module.exports = new RedisService();
