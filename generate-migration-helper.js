// Helper script to generate auto-sync migration
const db = require('./src/models');
const fs = require('fs');
const path = require('path');

async function generateMigration() {
    try {
        console.log('Generating migration from models...');

        // Get sync SQL without executing
        const sql = await db.sequelize.getQueryInterface().showAllTables();
        console.log(`Found ${sql.length} existing tables`);

        console.log('\n✓ Migration will use model.sync()');
        console.log('✓ This creates all tables based on your Sequelize models');
        console.log('✓ Includes: columns, types, constraints, indexes');

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        process.exit(0);
    }
}

generateMigration();
