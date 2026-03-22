require('dotenv').config();
const { sequelize, Organization, BusinessPlan } = require('../src/models');
const { Op } = require('sequelize');

async function cleanup() {
    try {
        console.log('--- STARTING FINAL COMPREHENSIVE SYSTEM CLEANUP ---');

        // 1. Identify Inzeedo
        const inzeedo = await Organization.findOne({
            where: { name: 'Inzeedo' }
        });

        if (!inzeedo) {
            console.error('❌ Inzeedo organization not found. Cleanup aborted for safety.');
            process.exit(1);
        }

        const inzeedoId = inzeedo.id;
        console.log(`✅ Identified Inzeedo (ID: ${inzeedoId})`);

        // 2. Identify all other organizations
        const otherOrgs = await Organization.findAll({
            where: { id: { [Op.ne]: inzeedoId } }
        });

        const otherOrgIds = otherOrgs.map(o => o.id);

        if (otherOrgIds.length === 0) {
            console.log('No other organizations to cleanup.');
        } else {
            console.log(`Found ${otherOrgs.length} other organizations to remove.`);

            const models = require('../src/models');

            // Absolute Comprehensive list of models to check for organization_id
            const modelsWithOrgId = [
                'ProductVariant', 'VariantAttributeValue', 'Product', 'ProductBatch', 'Stock', 'StockOpening',
                'AttributeValue', 'Attribute', 'SubCategory', 'MainCategory', 'Brand', 'Unit', 'MeasurementUnit', 'Container',
                'Supplier', 'Customer', 'Sale', 'SaleItem', 'SaleReturn', 'SaleReturnItem', 'PurchaseOrder', 'PurchaseOrderItem',
                'PurchaseReturn', 'PurchaseReturnItem', 'GRN', 'GRNItem', 'StockAdjustment', 'StockTransfer', 'StockTransferItem',
                'Expense', 'ExpenseCategory', 'Account', 'Transaction', 'Cheque', 'Role', 'Branch', 'User',
                'SubscriptionHistory', 'AuditLog', 'RefreshToken',
                'ProductAttribute', 'ProductSupplier', 'SaleEmployee'
            ];

            for (const modelName of modelsWithOrgId) {
                if (models[modelName]) {
                    try {
                        const deleted = await models[modelName].destroy({
                            where: { organization_id: { [Op.in]: otherOrgIds } }
                        });
                        if (deleted > 0) console.log(`  - Removed ${deleted} records from ${modelName}`);
                    } catch (e) {
                        // console.log(`  ⚠️ Warning: Could not delete from ${modelName}: ${e.message}`);
                    }
                }
            }

            // Finally delete the organizations
            for (const org of otherOrgs) {
                try {
                    await org.destroy();
                    console.log(`  ✅ Organization ${org.name} deleted.`);
                } catch (e) {
                    console.error(`  ❌ Failed to delete organization ${org.name}: ${e.message}`);
                }
            }
        }

        // 3. Promote Inzeedo to Permanent status
        const enterprisePlan = await BusinessPlan.findOne({ where: { name: 'Enterprise' } });

        inzeedo.subscription_tier = 'Enterprise';
        inzeedo.billing_cycle = 'Lifetime';
        inzeedo.subscription_status = 'Active';
        inzeedo.subscription_expiry_date = null;
        inzeedo.email = 'admin@emipos.com';

        if (enterprisePlan) {
            inzeedo.plan_id = enterprisePlan.id;
        }

        await inzeedo.save();
        console.log(`\n✅ INZEEDO CONSOLIDATED:`);
        console.log(`- Status: Active Enterprise (Lifetime)`);
        console.log(`- Expiry: Permanent`);

        console.log('\n--- CLEANUP COMPLETE ---');
        process.exit(0);
    } catch (error) {
        console.error('❌ Cleanup failed:', error);
        process.exit(1);
    }
}

cleanup();
