const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
};

async function globalStandardizationRescue() {
    let connection;
    try {
        console.log('📡 [1/4] Connecting to Database:', dbConfig.database);
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected.');

        // 1. GET ALL TABLES
        const [tables] = await connection.execute(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = ?`, 
            [dbConfig.database]
        );
        const tableNames = tables.map(t => t.TABLE_NAME);
        console.log(`📊 [2/4] Found ${tableNames.length} tables to analyze.`);

        // 2. UNIVERSAL INDEX CLEANUP
        console.log('\n🧹 [3/4] Starting Global Index Cleanup...');
        for (const tableName of tableNames) {
            try {
                const [indexes] = await connection.execute(`SHOW INDEX FROM ${tableName}`);
                const redundantIndexes = [...new Set(indexes
                    .map(i => i.Key_name)
                    .filter(name => /(_\d+)$/.test(name)))];

                if (redundantIndexes.length > 0) {
                    console.log(`  - Table [${tableName}]: Dropping ${redundantIndexes.length} junk indexes...`);
                    for (const idx of redundantIndexes) {
                        if (idx === 'PRIMARY') continue;
                        try {
                            await connection.execute(`ALTER TABLE ${tableName} DROP INDEX ${idx}`);
                        } catch (e) { /* Ignore if it's already gone or a system lock */ }
                    }
                }
            } catch (err) {
                // Skip tables that might not have indexes or are views
            }
        }

        // 3. GLOBAL COLLATION STANDARDIZATION (Fixes Errno 150)
        console.log('\n🧪 [4/4] Starting Universal Collation Standardization (IDs)...');
        // We target columns that look like UUIDs/IDs (CHAR 36)
        const [columns] = await connection.execute(`
            SELECT TABLE_NAME, COLUMN_NAME 
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = ? 
            AND COLUMN_TYPE = 'char(36)'`, 
            [dbConfig.database]
        );

        console.log(`  - Found ${columns.length} ID columns to standardize.`);
        
        // Disable foreign key checks temporarily to allow collation changes
        await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
        
        for (const col of columns) {
            try {
                console.log(`    ✔️ Syncing: ${col.TABLE_NAME}.${col.COLUMN_NAME} -> utf8mb4_bin`);
                await connection.execute(`
                    ALTER TABLE ${col.TABLE_NAME} 
                    MODIFY ${col.COLUMN_NAME} CHAR(36) 
                    CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
                `);
            } catch (err) {
                console.error(`    ❌ Error on ${col.TABLE_NAME}.${col.COLUMN_NAME}: ${err.message}`);
            }
        }

        // 4. DATA SANITIZATION (Empty strings to NULL)
        console.log('\n🧼 Finalizing: Sanitizing empty ID strings...');
        for (const col of columns) {
           try {
               await connection.execute(`UPDATE ${col.TABLE_NAME} SET ${col.COLUMN_NAME} = NULL WHERE ${col.COLUMN_NAME} = ''`);
           } catch (e) {}
        }

        await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
        console.log('\n✨ DATABASE STANDARDIZATION COMPLETE!');
        console.log('🚀 Service is ready to boot.');

    } catch (error) {
        console.error('\n💥 CRITICAL RESCUE ERROR:', error.message);
    } finally {
        if (connection) await connection.end();
    }
}

globalStandardizationRescue();
