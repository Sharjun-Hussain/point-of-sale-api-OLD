const { sequelize } = require('./src/models');

async function debug() {
    try {
        const [results, metadata] = await sequelize.query("DESCRIBE organizations");
        console.log('Table Structure:', results);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

debug();
