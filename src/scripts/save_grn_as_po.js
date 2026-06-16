/**
 * ============================================================
 * SCRIPT: SAVE GRN AS PURCHASE ORDER (DRAFT)
 * ============================================================
 * Use this script when a user mistakenly created a large Direct GRN
 * and wants to "edit" it without losing the typed items.
 * 
 * Since GRNs cannot be edited, this script reads the GRN items and 
 * creates a Purchase Order (which acts like a draft).
 * 
 * After running this, the user can:
 * 1. Safely run delete_bad_grn.js to remove the bad GRN.
 * 2. Go to the POS UI -> Purchase Orders -> Find the new PO.
 * 3. Edit the PO and click "Receive" to generate the correct GRN.
 * 
 * Usage: node src/scripts/save_grn_as_po.js <GRN_NUMBER>
 * Example: node src/scripts/save_grn_as_po.js GRN-20260610-0002
 */

require('dotenv').config({ path: __dirname + '/../../.env' });
const db = require('../models');

const grnNumber = process.argv[2];

if (!grnNumber) {
    console.error('❌ Usage: node save_grn_as_po.js <GRN_NUMBER>');
    process.exit(1);
}

async function convertGRNtoPO(grnNumber) {
    try {
        const grn = await db.GRN.findOne({
            where: { grn_number: grnNumber },
            include: [
                { model: db.GRNItem, as: 'items' }
            ]
        });

        if (!grn) {
            console.error(`❌ GRN "${grnNumber}" NOT FOUND.`);
            process.exit(1);
        }

        if (grn.purchase_order_id) {
            console.error(`❌ GRN "${grnNumber}" is already linked to a Purchase Order!`);
            console.error(`   You can just delete this GRN and receive the original PO again.`);
            process.exit(1);
        }

        if (!grn.items || grn.items.length === 0) {
            console.error(`❌ GRN "${grnNumber}" has no items.`);
            process.exit(1);
        }

        const poNumber = `PO-DRAFT-${Date.now()}`;
        
        console.log(`⏳ Converting GRN ${grnNumber} with ${grn.items.length} items into Purchase Order...`);

        // Create PO
        const newPO = await db.PurchaseOrder.create({
            organization_id: grn.organization_id,
            branch_id: grn.branch_id,
            supplier_id: grn.supplier_id,
            user_id: grn.user_id,
            po_number: poNumber,
            total_amount: grn.total_amount,
            status: 'ordered', // Draft status
            order_date: new Date()
        });

        // Create PO Items
        const poItemsToCreate = grn.items.map(item => ({
            purchase_order_id: newPO.id,
            product_id: item.product_id,
            product_variant_id: item.product_variant_id,
            quantity: item.quantity_received, // Map received qty to ordered qty
            unit_cost: item.unit_cost,
            total_amount: item.total_amount,
            organization_id: item.organization_id,
            discount_percentage: 0
        }));

        await db.PurchaseOrderItem.bulkCreate(poItemsToCreate);

        console.log('\n============================================================');
        console.log(`✅ SUCCESS! Saved GRN items as a Draft Purchase Order.`);
        console.log(`   New PO Number: ${poNumber}`);
        console.log('============================================================\n');
        
        console.log('NEXT STEPS:');
        console.log('1. Delete the bad GRN to fix the inventory and accounting:');
        console.log(`   node src/scripts/delete_bad_grn.js ${grnNumber} --confirm\n`);
        console.log('2. Go to the Web App -> Procurement -> Purchase Orders.');
        console.log(`3. Find ${poNumber}, click "Receive", edit the quantities/prices, and save to create the correct GRN!`);

    } catch (error) {
        console.error('❌ Error creating PO:', error);
    } finally {
        process.exit(0);
    }
}

convertGRNtoPO(grnNumber);
