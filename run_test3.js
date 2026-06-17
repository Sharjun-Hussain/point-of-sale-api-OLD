require('dotenv').config();
const { Stock, Product, ProductVariant, Branch, sequelize } = require('./src/models');
const { Op } = require('sequelize');

async function test() {
    try {
        const variant = await ProductVariant.findOne({ where: { barcode: '22796971920' } });
        if (variant) {
            console.log("Variant found:", variant.toJSON());
            
            const stock = await Stock.findOne({ where: { product_variant_id: variant.id } });
            if (stock) {
                console.log("Stock found for variant:", stock.toJSON());
            } else {
                console.log("NO STOCK found for variant ID:", variant.id);
            }
        } else {
            console.log("Variant not found in DB");
        }
    } catch (e) {
        console.error(e);
    } finally {
        await sequelize.close();
    }
}
test();
