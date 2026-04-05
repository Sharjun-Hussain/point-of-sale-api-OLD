require('dotenv').config();
const { PurchaseOrder, PurchaseOrderItem, Product, Organization } = require('./src/models');
const { v4: uuidv4 } = require('uuid');

async function seedPOItems() {
    try {
        console.log('--- Seeding Purchase Order Items ---');

        // Find existing POs
        const pos = await PurchaseOrder.findAll();
        if (pos.length === 0) {
            console.error('No purchase orders found to seed.');
            process.exit(1);
        }

        // Find some products
        const products = await Product.findAll({ limit: 5 });
        if (products.length === 0) {
            console.error('No products found to seed.');
            process.exit(1);
        }

        for (const po of pos) {
            console.log(`Processing PO: ${po.po_number} (ID: ${po.id})`);
            
            // Check if it already has items
            const count = await PurchaseOrderItem.count({ where: { purchase_order_id: po.id } });
            if (count > 0) {
                console.log(`- PO already has ${count} items. Skipping.`);
                continue;
            }

            // Add 2 items to each PO
            for (let i = 0; i < 2; i++) {
                const product = products[i % products.length];
                const qty = 10 + i;
                const cost = 50 + (i * 10);
                
                await PurchaseOrderItem.create({
                    id: uuidv4(),
                    purchase_order_id: po.id,
                    product_id: product.id,
                    quantity: qty,
                    quantity_received: po.status === 'received' ? qty : 0,
                    unit_cost: cost,
                    total_amount: qty * cost
                });
                console.log(`  + Added product: ${product.name}, Qty: ${qty}`);
            }
        }

        console.log('\nSeeding complete!');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

seedPOItems();
