const { sequelize } = require('./src/models');

async function syncGRNDatabase() {
    try {
        console.log('🔄 Starting GRN Database Sync...');

        // 1. Add columns to grns table
        await sequelize.query(`
            ALTER TABLE grns 
            ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(255) NULL AFTER notes,
            ADD COLUMN IF NOT EXISTS invoice_file VARCHAR(255) NULL AFTER invoice_number;
        `);
        console.log('✅ Updated grns table.');

        // 2. Add columns to grn_items table
        await sequelize.query(`
            ALTER TABLE grn_items 
            ADD COLUMN IF NOT EXISTS free_quantity DECIMAL(15, 2) DEFAULT 0.00 AFTER quantity_received,
            ADD COLUMN IF NOT EXISTS product_batch_id CHAR(36) NULL AFTER batch_number;
        `);
        console.log('✅ Updated grn_items table.');

        console.log('✨ Database sync completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error syncing database:', error);
        process.exit(1);
    }
}

syncGRNDatabase();
