const dotenv = require('dotenv');

// Load environment variables for test
dotenv.config({ path: '.env.test' });

// Increase timeout for DB sync
jest.setTimeout(30000);

// Force correct env values for test runs
process.env.NODE_ENV = 'test';
process.env.PORT = 0; // Use random port to prevent conflicts
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// Use test database explicitly for the connection pool
process.env.DB_NAME = process.env.DB_NAME_TEST || 'pos_system_test';

const db = require('../src/models');
const sequelize = db.sequelize;

beforeAll(async () => {
    try {
        await sequelize.authenticate();
        console.log('Test database connection has been established successfully.');

        // Disable FK checks so force:true can drop tables with circular/complex dependencies
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');

        // Sync models to the test database (drops and recreates tables)
        await sequelize.sync({ force: true });

        // Re-enable FK checks
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        console.log('Test database schema synced successfully.');
    } catch (error) {
        console.error('Unable to connect or sync the test database:', error);
    }
});

afterAll(async () => {
    // Close connection after tests
    await sequelize.close();
});
