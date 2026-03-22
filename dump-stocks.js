require('dotenv').config();
const { Stock, Product, ProductVariant, Branch } = require('./src/models');

async function test() {
    try {
        const stocks = await Stock.findAll({
            include: [
                { model: Product, as: 'product' },
                { model: ProductVariant, as: 'variant' },
                { model: Branch, as: 'branch' },
            ]
        });
        console.log("Found stocks:", stocks.length);
        console.log(JSON.stringify(stocks, null, 2));
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
test();
