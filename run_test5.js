require('dotenv').config();
const { ProductVariant, sequelize } = require('./src/models');

async function test() {
    try {
        const variant = await ProductVariant.findByPk('fe97bf55-7a11-4797-9aa4-14a121c9a683');
        console.log("Variant with stock:", variant.toJSON());
    } catch (e) {
        console.error(e);
    } finally {
        await sequelize.close();
    }
}
test();
