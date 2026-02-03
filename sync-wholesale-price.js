require('dotenv').config();
const { sequelize } = require('./src/models');

async function syncWholesalePrice() {
    try {
        console.log('🔄 Starting Wholesale Price Database Sync...');

        // 1. Add column to product_variants table
        await sequelize.query(`
            ALTER TABLE product_variants 
            ADD COLUMN IF NOT EXISTS wholesale_price DECIMAL(15, 2) DEFAULT 0.00 AFTER price;
        `);
        console.log('✅ Updated product_variants table.');

        // 2. Add column to product_batches table
        await sequelize.query(`
            ALTER TABLE product_batches 
            ADD COLUMN IF NOT EXISTS wholesale_price DECIMAL(15, 2) DEFAULT 0.00 AFTER selling_price;
        `);
        console.log('✅ Updated product_batches table.');

        console.log('✨ Database sync completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error syncing database:', error);
        process.exit(1);
    }
}

syncWholesalePrice();
