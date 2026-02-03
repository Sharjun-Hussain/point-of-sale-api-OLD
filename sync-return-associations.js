const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
    process.env.DB_NAME || 'pos_system',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
        host: process.env.DB_HOST || 'localhost',
        dialect: 'mysql',
        logging: false
    }
);

async function syncReturnAssociations() {
    try {
        console.log('🔄 Starting Purchase Return Associations Sync...');

        await sequelize.query(`
            ALTER TABLE purchase_returns 
            ADD COLUMN IF NOT EXISTS purchase_order_id CHAR(36) BINARY DEFAULT NULL AFTER supplier_id,
            ADD COLUMN IF NOT EXISTS grn_id CHAR(36) BINARY DEFAULT NULL AFTER purchase_order_id;
        `);
        console.log('✅ Updated purchase_returns table.');

        console.log('✨ Database sync completed successfully!');
    } catch (error) {
        console.error('❌ Error during database sync:', error);
    } finally {
        await sequelize.close();
    }
}

syncReturnAssociations();
