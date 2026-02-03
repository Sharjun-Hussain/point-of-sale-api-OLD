require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        logging: console.log
    }
);

async function alterTable() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected');

        await sequelize.query(`
            ALTER TABLE product_variants 
            MODIFY COLUMN name VARCHAR(255) NULL
        `);

        console.log('✅ Successfully altered product_variants.name to be nullable');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

alterTable();
