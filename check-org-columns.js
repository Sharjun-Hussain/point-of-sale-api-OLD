const { Sequelize } = require('sequelize');
const config = require('./config/config.js');
const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

const sequelize = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, {
    host: dbConfig.host,
    dialect: dbConfig.dialect
});

async function checkColumns() {
    try {
        const [results, metadata] = await sequelize.query("SHOW COLUMNS FROM organizations");
        console.log("Columns in 'organizations' table:");
        results.forEach(col => console.log(`- ${col.Field} (${col.Type})`));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

checkColumns();
