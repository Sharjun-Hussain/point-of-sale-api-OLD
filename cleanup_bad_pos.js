/**
 * ONE-TIME CLEANUP SCRIPT
 * Removes orphan "Auto-generated for Direct GRN" purchase orders.
 *
 * WHY ONLY 2 TABLES:
 *   The bug committed the PO transaction first, then the GRN transaction
 *   FAILED and rolled back. So ONLY these tables were written:
 *     ✅ purchase_orders       → needs cleanup
 *     ✅ purchase_order_items  → needs cleanup
 *     ❌ grns, grn_items, product_batches, stocks, transactions, audit_logs
 *        → all rolled back, nothing to clean
 *
 * Run:  node cleanup_bad_pos.js
 * Then: rm cleanup_bad_pos.js
 */

const db = require('./src/models');

async function cleanup() {
    const t = await db.sequelize.transaction();
    try {
        // Find the bad POs
        const badPOs = await db.PurchaseOrder.findAll({
            where: { remarks: 'Auto-generated for Direct GRN', status: 'received' },
            attributes: ['id', 'po_number', 'total_amount', 'created_at'],
            transaction: t
        });

        if (badPOs.length === 0) {
            console.log('✅ No bad POs found. Nothing to clean up.');
            await t.rollback();
            return;
        }

        console.log(`\n🔍 Found ${badPOs.length} bad purchase order(s):`);
        badPOs.forEach(po => {
            console.log(`   - ${po.po_number}  |  LKR ${po.total_amount}  |  Created: ${po.created_at}`);
        });

        const poIds = badPOs.map(po => po.id);

        // Step 1: Delete PO items first (FK constraint requires this order)
        const deletedItems = await db.PurchaseOrderItem.destroy({
            where: { purchase_order_id: poIds },
            transaction: t
        });
        console.log(`\n🗑️  Deleted ${deletedItems} purchase_order_items row(s)`);

        // Step 2: Delete the POs
        const deletedPOs = await db.PurchaseOrder.destroy({
            where: { id: poIds },
            transaction: t
        });
        console.log(`🗑️  Deleted ${deletedPOs} purchase_orders row(s)`);

        await t.commit();
        console.log('\n✅ Done. No traces left.\n');

    } catch (error) {
        await t.rollback();
        console.error('\n❌ Failed — rolled back, nothing changed:', error.message);
        process.exit(1);
    } finally {
        await db.sequelize.close();
    }
}

cleanup();
