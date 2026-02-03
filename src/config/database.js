const { Sequelize } = require('sequelize');

// Database configuration
const sequelize = new Sequelize(
    process.env.DB_NAME || 'pos_system',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        dialect: process.env.DB_DIALECT || 'mysql',
        logging: process.env.NODE_ENV === 'development' ? console.log : false,
        pool: {
            max: 10,
            min: 0,
            acquire: 30000,
            idle: 10000
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
