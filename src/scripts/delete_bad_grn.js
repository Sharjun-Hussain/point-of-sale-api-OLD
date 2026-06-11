/**
 * ============================================================
 * PRODUCTION-SAFE GRN REVERSAL SCRIPT
 * ============================================================
 * HOW TO USE:
 *
 *   STEP 1 — AUDIT FIRST (no data is changed, just shows what will be deleted):
 *     node src/scripts/delete_bad_grn.js GRN-20260610-0002 --dry-run
 *
 *   STEP 2 — If the audit looks correct, run the real deletion:
 *     node src/scripts/delete_bad_grn.js GRN-20260610-0002 --confirm
 *
 * What this script reverses (in order):
 *   1. Ledger Transactions  (account balances are restored)
 *   2. GRN Items            (linked product batches quantity decremented)
 *   3. Stock Records        (quantity decremented per item)
 *   4. Product Batches      (deleted only if quantity reaches 0 after decrement)
 *   5. Attachments          (file records for the GRN)
 *   6. Audit Logs           (GRN audit trail removed)
 *   7. Purchase Order Items
 *   8. Purchase Order
 *   9. GRN (the main record)
 * ============================================================
 */

require('dotenv').config({ path: __dirname + '/../../.env' });
const db = require('../models');

const grnNumber = process.argv[2];
const mode = process.argv[3]; // --dry-run or --confirm

if (!grnNumber) {
    console.error('❌  Usage: node delete_bad_grn.js <GRN_NUMBER> [--dry-run | --confirm]');
    console.error('   Example: node delete_bad_grn.js GRN-20260610-0002 --dry-run');
    process.exit(1);
}

if (!mode || (mode !== '--dry-run' && mode !== '--confirm')) {
    console.error('❌  You must specify a mode: --dry-run or --confirm');
    console.error('   Always run --dry-run first to verify what will be deleted.');
    process.exit(1);
}

const isDryRun = mode === '--dry-run';

async function auditGRN(grnNumber) {
    console.log('\n============================================================');
    console.log(isDryRun ? '  DRY RUN AUDIT (nothing will be changed)' : '  ⚠️  LIVE DELETION — THIS WILL MODIFY PRODUCTION DATA');
    console.log('============================================================\n');

    const t = isDryRun ? null : await db.sequelize.transaction();

    try {
        // ── 1. Find the GRN ──────────────────────────────────────────────────────
        const grn = await db.GRN.findOne({
            where: { grn_number: grnNumber },
            include: [
                { model: db.Supplier, as: 'supplier', attributes: ['id', 'name'] },
                { model: db.Branch, as: 'branch', attributes: ['id', 'name'] },
                { model: db.User, as: 'received_by_user', attributes: ['id', 'name'] }
            ],
            ...(t ? { transaction: t } : {})
        });

        if (!grn) {
            console.log(`❌  GRN "${grnNumber}" NOT FOUND in the database.`);
            if (t) await t.rollback();
            process.exit(1);
        }

        console.log('┌─────────────────────────────────────────────────────────┐');
        console.log('│  GRN RECORD                                             │');
        console.log('├─────────────────────────────────────────────────────────┤');
        console.log(`│  GRN Number : ${grn.grn_number}`);
        console.log(`│  GRN ID     : ${grn.id}`);
        console.log(`│  Supplier   : ${grn.supplier?.name || grn.supplier_id}`);
        console.log(`│  Branch     : ${grn.branch?.name || grn.branch_id}`);
        console.log(`│  Received By: ${grn.received_by_user?.name || grn.user_id}`);
        console.log(`│  Total Amt  : LKR ${parseFloat(grn.total_amount).toLocaleString()}`);
        console.log(`│  Status     : ${grn.status}`);
        console.log(`│  Date       : ${grn.received_date}`);
        console.log('└─────────────────────────────────────────────────────────┘\n');

        // ── 2. GRN Items ─────────────────────────────────────────────────────────
        const grnItems = await db.GRNItem.findAll({
            where: { grn_id: grn.id },
            include: [
                { model: db.Product, as: 'product', attributes: ['id', 'name'] },
                { model: db.ProductBatch, as: 'batch', attributes: ['id', 'batch_number', 'quantity'] }
            ],
            ...(t ? { transaction: t } : {})
        });

        console.log(`┌─ GRN ITEMS (${grnItems.length}) ─────────────────────────────────────────┐`);
        let grnItemTotal = 0;
        for (const item of grnItems) {
            const lineTotal = parseFloat(item.unit_cost) * parseFloat(item.quantity_received);
            grnItemTotal += lineTotal;
            console.log(`│  Product    : ${item.product?.name || item.product_id}`);
            console.log(`│  Qty Recv   : ${item.quantity_received} | Free: ${item.free_quantity} | Cost: LKR ${parseFloat(item.unit_cost).toLocaleString()} | Line Total: LKR ${lineTotal.toLocaleString()}`);
            console.log(`│  Batch      : ${item.batch?.batch_number || '—'} (Current Batch Qty: ${item.batch?.quantity || '?'})`);
            console.log('│');
        }
        console.log(`│  LINE TOTAL SUM: LKR ${grnItemTotal.toLocaleString()} | GRN HEADER TOTAL: LKR ${parseFloat(grn.total_amount).toLocaleString()}`);
        if (Math.abs(grnItemTotal - parseFloat(grn.total_amount)) > 1) {
            console.log('│  ⚠️  MISMATCH DETECTED — This confirms the bug. Header total differs from item sum.');
        }
        console.log('└─────────────────────────────────────────────────────────┘\n');

        // ── 3. Ledger Transactions ────────────────────────────────────────────────
        const transactions = await db.Transaction.findAll({
            where: { reference_type: 'GRN', reference_id: grn.id },
            include: [{ model: db.Account, as: 'account', attributes: ['id', 'code', 'name', 'balance'] }],
            ...(t ? { transaction: t } : {})
        });

        console.log(`┌─ LEDGER TRANSACTIONS (${transactions.length}) ─────────────────────────────┐`);
        for (const tr of transactions) {
            console.log(`│  Account    : [${tr.account?.code}] ${tr.account?.name}`);
            console.log(`│  Type       : ${tr.type.toUpperCase()} | Amount: LKR ${parseFloat(tr.amount).toLocaleString()}`);
            console.log(`│  Curr. Bal  : LKR ${parseFloat(tr.account?.balance || 0).toLocaleString()}`);
            console.log(`│  After Rev  : LKR ${(parseFloat(tr.account?.balance || 0) - parseFloat(tr.amount)).toLocaleString()}`);
            console.log('│');
        }
        console.log('└─────────────────────────────────────────────────────────┘\n');

        // ── 4. Purchase Order ─────────────────────────────────────────────────────
        let po = null;
        let poItems = [];
        if (grn.purchase_order_id) {
            po = await db.PurchaseOrder.findByPk(grn.purchase_order_id, {
                ...(t ? { transaction: t } : {})
            });
            if (po) {
                poItems = await db.PurchaseOrderItem.findAll({
                    where: { purchase_order_id: po.id },
                    ...(t ? { transaction: t } : {})
                });
            }
        }

        console.log(`┌─ PURCHASE ORDER ─────────────────────────────────────────┐`);
        if (po) {
            console.log(`│  PO Number  : ${po.po_number}`);
            console.log(`│  PO ID      : ${po.id}`);
            console.log(`│  PO Total   : LKR ${parseFloat(po.total_amount).toLocaleString()}`);
            console.log(`│  PO Items   : ${poItems.length} rows`);
        } else {
            console.log('│  No linked Purchase Order found.');
        }
        console.log('└─────────────────────────────────────────────────────────┘\n');

        // ── 5. Attachments ────────────────────────────────────────────────────────
        const attachments = await db.Attachment.findAll({
            where: { entity_type: 'GRN', entity_id: grn.id },
            ...(t ? { transaction: t } : {})
        });

        // ── 6. Audit Logs ─────────────────────────────────────────────────────────
        const auditLogs = await db.AuditLog.findAll({
            where: { entity_type: 'GRN', entity_id: grn.id },
            ...(t ? { transaction: t } : {})
        });

        console.log('┌─ SUMMARY OF WHAT WILL BE DELETED ───────────────────────┐');
        console.log(`│  GRN Records           : 1`);
        console.log(`│  GRN Items             : ${grnItems.length}`);
        console.log(`│  Product Batches (qty) : ${grnItems.length} batch quantities will be decremented`);
        console.log(`│  Stock Records         : ${grnItems.length} stock quantities will be decremented`);
        console.log(`│  Ledger Transactions   : ${transactions.length}`);
        console.log(`│  Account balances      : ${transactions.length} accounts will be restored`);
        console.log(`│  Purchase Order        : ${po ? 1 : 0}`);
        console.log(`│  PO Items              : ${poItems.length}`);
        console.log(`│  Attachments           : ${attachments.length}`);
        console.log(`│  Audit Logs            : ${auditLogs.length}`);
        console.log('└─────────────────────────────────────────────────────────┘\n');

        if (isDryRun) {
            console.log('✅  DRY RUN COMPLETE — No data was changed.');
            console.log('    If the above looks correct, run with --confirm to execute.\n');
            process.exit(0);
        }

        // ══════════════════════════════════════════════════════════════════════════
        //  LIVE DELETION BELOW
        // ══════════════════════════════════════════════════════════════════════════
        console.log('⚙️   Starting deletion inside a transaction...\n');

        // Step A: Reverse Ledger Transactions
        for (const tr of transactions) {
            const account = await db.Account.findByPk(tr.account_id, { transaction: t });
            if (account) {
                await account.decrement('balance', { by: parseFloat(tr.amount), transaction: t });
                console.log(`  ✔ Reversed account [${account.code}] ${account.name} by LKR ${parseFloat(tr.amount).toLocaleString()}`);
            }
            await tr.destroy({ transaction: t });
        }

        // Step B: Delete GRN Items, decrement batches & stock
        for (const item of grnItems) {
            const totalQty = parseFloat(item.quantity_received) + parseFloat(item.free_quantity);

            // Decrement batch
            if (item.product_batch_id) {
                const batch = await db.ProductBatch.findByPk(item.product_batch_id, { transaction: t });
                if (batch) {
                    const newQty = parseFloat(batch.quantity) - totalQty;
                    if (newQty <= 0) {
                        await batch.destroy({ transaction: t });
                        console.log(`  ✔ Deleted batch ${batch.batch_number} (qty would reach zero)`);
                    } else {
                        await batch.update({ quantity: newQty }, { transaction: t });
                        console.log(`  ✔ Decremented batch ${batch.batch_number}: ${batch.quantity} → ${newQty}`);
                    }
                }
            }

            // Decrement stock
            const stock = await db.Stock.findOne({
                where: {
                    organization_id: grn.organization_id,
                    branch_id: grn.branch_id,
                    product_id: item.product_id,
                    product_variant_id: item.product_variant_id
                },
                transaction: t
            });
            if (stock) {
                await stock.decrement('quantity', { by: totalQty, transaction: t });
                console.log(`  ✔ Decremented stock for product ${item.product_id} by ${totalQty}`);
            }

            await item.destroy({ transaction: t });
        }
        console.log(`  ✔ Deleted ${grnItems.length} GRN item(s)`);

        // Step C: Delete Attachments
        for (const att of attachments) {
            await att.destroy({ transaction: t });
        }
        if (attachments.length > 0) console.log(`  ✔ Deleted ${attachments.length} attachment(s)`);

        // Step D: Delete Audit Logs
        await db.AuditLog.destroy({
            where: { entity_type: 'GRN', entity_id: grn.id },
            transaction: t
        });
        console.log(`  ✔ Deleted ${auditLogs.length} audit log(s)`);

        // Step E: Delete PO Items and PO
        for (const poi of poItems) {
            await poi.destroy({ transaction: t });
        }
        if (poItems.length > 0) console.log(`  ✔ Deleted ${poItems.length} PO item(s)`);
        if (po) {
            await po.destroy({ transaction: t });
            console.log(`  ✔ Deleted Purchase Order ${po.po_number}`);
        }

        // Step F: Delete GRN
        await grn.destroy({ transaction: t });
        console.log(`  ✔ Deleted GRN ${grnNumber}`);

        // Commit
        await t.commit();

        console.log('\n============================================================');
        console.log('  ✅  REVERSION COMPLETE — All data has been cleanly erased.');
        console.log('      You can now redo the Direct GRN with the correct data.');
        console.log('============================================================\n');

    } catch (error) {
        if (t) await t.rollback();
        console.error('\n❌  ERROR — Transaction rolled back. Nothing was changed.\n');
        console.error(error);
    } finally {
        process.exit(0);
    }
}

auditGRN(grnNumber);
