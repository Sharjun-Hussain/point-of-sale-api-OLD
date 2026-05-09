require('dotenv').config();

async function test() {
    const { Product, ProductVariant, Stock, sequelize } = require('../src/models');
    
    try {
        const products = await Product.findAll({
            where: { is_active: true },
            attributes: ['id', 'name'],
            include: [
                {
                    model: Stock,
                    as: 'stocks',
                    attributes: ['quantity', 'branch_id'],
                    required: false
                },
                {
                    model: ProductVariant,
                    as: 'variants',
                    attributes: ['id', 'name'],
                    include: [
                        {
                            model: Stock,
                            as: 'stocks',
                            attributes: ['quantity', 'branch_id'],
                            required: false
                        }
                    ]
                }
            ],
            limit: 2
        });
        
        console.log(JSON.stringify(products, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await sequelize.close();
    }
}

test();
