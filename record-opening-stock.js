require('dotenv').config();
const {
    StockOpening,
    ProductBatch,
    Stock,
    Product,
    ProductVariant,
    sequelize
} = require('./src/models');

async function recordOpeningStock() {
    const t = await sequelize.transaction();
    try {
        const organization_id = 'fed43916-a78d-413e-8e39-e68cbebc7ca5';
        const branch_id = 'cf3a2759-3c83-42ca-b9f7-97164bfe8918';
        const user_id = 'c813ce2d-c395-494d-8f82-c86d60d8eaab';
        const reference_number = 'OS-TEST-001';

        const items = [
            {
                product_id: '7c57a43b-3238-4da2-b435-759827c9b4ab',
                product_variant_id: 'f41fb227-9023-4662-ba61-8ce30b1936bd',
                quantity: 50,
                cost_price: 850,
                selling_price: 1200,
                batch_number: 'BATCH-001'
            }
        ];

        // 1. Create StockOpening Header
        const opening = await StockOpening.create({
            organization_id,
            branch_id,
            user_id,
            reference_number,
            opening_date: new Date(),
            notes: 'Manual script seeding for verification',
            total_value: items.reduce((acc, item) => acc + (item.quantity * item.cost_price), 0)
        }, { transaction: t });

        // 2. Process Items
        for (const item of items) {
            // Create Product Batch
            await ProductBatch.create({
                organization_id,
                branch_id,
                product_id: item.product_id,
                product_variant_id: item.product_variant_id,
                batch_number: item.batch_number,
                purchase_date: new Date(),
                cost_price: item.cost_price,
                selling_price: item.selling_price,
                quantity: item.quantity,
                opening_stock_id: opening.id
            }, { transaction: t });

            // Update Stock
            const [stock] = await Stock.findOrCreate({
                where: {
                    organization_id,
                    branch_id,
                    product_id: item.product_id,
                    product_variant_id: item.product_variant_id
                },
                defaults: { quantity: 0, organization_id },
                transaction: t
            });
            await stock.increment('quantity', { by: item.quantity, transaction: t });
        }

        // Skipping accounting for now as it's just for UI verification, 
        // but the core inventory tables are now populated.

        await t.commit();
        console.log('✅ Opening stock recorded for Measuring Tape!');
    } catch (error) {
        await t.rollback();
        console.error('❌ Failed:', error);
    }
    process.exit(0);
}

recordOpeningStock();
