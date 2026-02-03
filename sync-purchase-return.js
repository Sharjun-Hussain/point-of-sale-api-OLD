require('dotenv').config();
const { sequelize } = require('./src/models');

async function syncPurchaseReturnDB() {
    try {
        console.log('🔄 Starting Purchase Return Database Sync...');

        // Create purchase_returns table
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS purchase_returns (
                id CHAR(36) NOT NULL PRIMARY KEY,
                organization_id CHAR(36) NOT NULL,
                branch_id CHAR(36) NOT NULL,
                supplier_id CHAR(36) NOT NULL,
                user_id CHAR(36) NOT NULL,
                return_number VARCHAR(255) NOT NULL UNIQUE,
                return_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                total_amount DECIMAL(15, 2) DEFAULT 0.00,
                status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending',
                notes TEXT NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            );
        `);
        console.log('✅ Created purchase_returns table.');

        // Create purchase_return_items table
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS purchase_return_items (
                id CHAR(36) NOT NULL PRIMARY KEY,
                purchase_return_id CHAR(36) NOT NULL,
                product_id CHAR(36) NOT NULL,
                product_variant_id CHAR(36) NULL,
                batch_number VARCHAR(255) NULL,
                quantity DECIMAL(15, 2) NOT NULL,
                unit_cost DECIMAL(15, 2) NOT NULL,
                total_amount DECIMAL(15, 2) NOT NULL,
                reason VARCHAR(255) NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                FOREIGN KEY (purchase_return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE
            );
        `);
        console.log('✅ Created purchase_return_items table.');

        console.log('✨ Database sync completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error syncing database:', error);
        process.exit(1);
    }
}

syncPurchaseReturnDB();
