require('dotenv').config();
const { Product, sequelize } = require('./src/models');

async function test() {
    try {
        const p = await Product.findByPk('5f04a6b0-491c-47c7-9974-214027d75e7c');
        console.log("Product:", p.toJSON());
    } catch (e) {
        console.error(e);
    } finally {
        await sequelize.close();
    }
}
test();
