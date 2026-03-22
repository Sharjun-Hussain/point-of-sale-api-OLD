require('dotenv').config();
const { Product, Stock, StockOpening, ProductBatch } = require('./src/models');

async function test() {
    try {
        const orgId = 'fed43916-a78d-413e-8e39-e68cbebc7ca5';

        const productsCount = await Product.count({ where: { organization_id: orgId } });
        const stocksCount = await Stock.count({ where: { organization_id: orgId } });
        const batchCount = await ProductBatch.count({ where: { organization_id: orgId } });
        const openingCount = await StockOpening.count({ where: { organization_id: orgId } });

        console.log(`Org: ${orgId}`);
        console.log(`Products: ${productsCount}`);
        console.log(`Stocks: ${stocksCount}`);
        console.log(`Batches: ${batchCount}`);
        console.log(`Openings: ${openingCount}`);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
test();
