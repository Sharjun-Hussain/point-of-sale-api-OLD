require('dotenv').config();
const { sequelize } = require('./src/models');

async function dropOrgIdFromBatch() {
    try {
        console.log('🔄 Dropping organization_id from product_batches...');

        await sequelize.query(`
            ALTER TABLE product_batches 
            DROP COLUMN organization_id;
        `);
        console.log('✅ Dropped organization_id from product_batches table.');

        console.log('✨ Database cleanup completed successfully!');
        process.exit(0);
    } catch (error) {
        // Ignore if error is "check that column/key exists" (code 1091)
        if (error.original && error.original.errno === 1091) {
            console.log('⚠️ Column organization_id does not exist, skipping.');
            process.exit(0);
        }
        console.error('❌ Error updating database:', error);
        process.exit(1);
    }
}

dropOrgIdFromBatch();
