require('dotenv').config();
const mysql = require('mysql2/promise');

async function reset() {
    const dbName = process.env.DB_NAME || 'pos_system';
    console.log(`🚀 Starting Desktop Database Reset for: ${dbName}`);

    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || '127.0.0.1',
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || ''
        });

        console.log(`🗑️  Dropping database \`${dbName}\`...`);
        await connection.query(`DROP DATABASE IF EXISTS \`${dbName}\`;`);
        
        console.log(`✨ Recreating database \`${dbName}\`...`);
        await connection.query(`CREATE DATABASE \`${dbName}\`;`);

        await connection.end();
        console.log('✅ Database reset successfully! Tables will be recreated on next app start.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to reset database:', error.message);
        process.exit(1);
    }
}

reset();
