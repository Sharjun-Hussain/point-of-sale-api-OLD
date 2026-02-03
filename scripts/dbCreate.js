require('dotenv').config();
const mysql = require('mysql2/promise');

const createDb = async () => {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || ''
    });

    const dbName = process.env.DB_NAME || 'pos_system';

    try {
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
        console.log(`✅ Database "${dbName}" created or already exists.`);
    } catch (error) {
        console.error('❌ Error creating database:', error);
    } finally {
        await connection.end();
    }
};

createDb();
