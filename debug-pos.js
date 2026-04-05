require('dotenv').config();
const { PurchaseOrder, Supplier, Organization, User, PurchaseOrderItem, Product, ProductVariant } = require('./src/models');

async function debugPurchaseOrders() {
    try {
        console.log('--- Purchase Order Debugging ---');

        const user = await User.findOne({ where: { email: 'admin@emipos.com' } });
        if (!user) {
            console.error('Admin user not found');
            process.exit(1);
        }

        const organizationId = user.organization_id;
        console.log(`Organization ID: ${organizationId}`);

        const purchaseOrders = await PurchaseOrder.findAll({
            where: { organization_id: organizationId },
            include: [
                { model: Supplier, as: 'supplier' },
                { 
                    model: PurchaseOrderItem, as: 'items',
                    include: [
                        { model: Product, as: 'product' },
                        { model: ProductVariant, as: 'variant' }
                    ]
                }
            ]
        });

        console.log(`Found ${purchaseOrders.length} purchase orders total.`);

        for (const po of purchaseOrders) {
            console.log(`\n- PO: ${po.po_number}, Status: ${po.status}, Supplier: ${po.supplier ? po.supplier.name : 'None'} (ID: ${po.supplier_id})`);
            console.log(`  Items: ${po.items ? po.items.length : 0}`);
            if (po.items && po.items.length > 0) {
                po.items.forEach((item, idx) => {
                    console.log(`    [${idx}] Product: ${item.product ? item.product.name : 'Unknown'}, Qty: ${item.quantity}, Rec: ${item.quantity_received}, cost: ${item.unit_cost}`);
                });
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debugPurchaseOrders();
