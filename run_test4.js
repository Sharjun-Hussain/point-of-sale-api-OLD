require('dotenv').config();
const { Stock, Product, ProductVariant, Branch, sequelize } = require('./src/models');

async function test() {
    try {
        const product_id = '5f04a6b0-491c-47c7-9974-214027d75e7c';
        
        const stocks = await Stock.findAll({ where: { product_id } });
        console.log("Stocks for product:", stocks.map(s => s.toJSON()));
    } catch (e) {
        console.error(e);
    } finally {
        await sequelize.close();
    }
}
test();
