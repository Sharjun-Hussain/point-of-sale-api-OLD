const { Sequelize } = require('sequelize');

// Detect platform
const isDesktop = process.env.APP_PLATFORM === 'DESKTOP' || process.env.ELECTRON_RUNNING === 'true';

// Database configuration
const sequelize = new Sequelize(
    process.env.DB_NAME || 'pos_system',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
        // On desktop, we default to localhost. If using portable MariaDB, 
        // we might use a custom port like 3307 to avoid conflicts.
        host: isDesktop ? '127.0.0.1' : (process.env.DB_HOST || 'localhost'),
        port: isDesktop ? (process.env.DB_PORT || 3306) : (process.env.DB_PORT || 3306),
        dialect: process.env.DB_DIALECT || 'mysql',
        logging: process.env.DB_LOGGING === 'true' ? console.log : false,
        pool: {
            max: parseInt(process.env.DB_POOL_MAX || '10'),
            min: parseInt(process.env.DB_POOL_MIN || '0'),
            acquire: parseInt(process.env.DB_POOL_ACQUIRE || '30000'),
            idle: parseInt(process.env.DB_POOL_IDLE || '10000')
        },
        define: {
            timestamps: true,
            underscored: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at'
        },
        timezone: '+05:30' // Set to your timezone
    }
);

module.exports = sequelize;
