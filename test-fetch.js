const { Product, ProductVariant } = require('./src/models');

async function test() {
    const products = await Product.findAll({
        where: { is_variant: true },
        include: [{ model: ProductVariant, as: 'variants' }]
    });
    console.log('Found products:', products.length);
    products.forEach(p => {
        console.log(`Product: ${p.name}, Variants: ${p.variants?.length || 0}`);
    });
    process.exit(0);
}

test();
