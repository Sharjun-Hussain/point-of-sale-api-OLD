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

async function dropLegacyColumns() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected');

        // Check if columns exist before dropping (preventing errors on repeat runs)
        const [results] = await sequelize.query("SHOW COLUMNS FROM product_variants");
        const columnNames = results.map(col => col.Field);

        const legacyColumns = ['color', 'material', 'style', 'size'];
        const columnsToDrop = legacyColumns.filter(col => columnNames.includes(col));

        if (columnsToDrop.length === 0) {
            console.log('ℹ️ No legacy columns found to drop.');
            process.exit(0);
        }

        console.log(`🚀 Dropping columns: ${columnsToDrop.join(', ')}...`);

        for (const col of columnsToDrop) {
            await sequelize.query(`ALTER TABLE product_variants DROP COLUMN ${col}`);
            console.log(`✅ Dropped column: ${col}`);
        }

        console.log('🎉 Successfully cleaned up legacy variant columns.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

dropLegacyColumns();
