require('dotenv').config();
const { sequelize } = require('./src/models');

async function syncProductBatchDB() {
    try {
        console.log('🔄 Starting Product Batch Database Sync...');

        // Add opening_stock_id column
        await sequelize.query(`
            ALTER TABLE product_batches 
            ADD COLUMN IF NOT EXISTS opening_stock_id CHAR(36) NULL AFTER is_active;
        `);
        console.log('✅ Updated product_batches table.');

        console.log('✨ Database sync completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error syncing database:', error);
        process.exit(1);
    }
}

syncProductBatchDB();
