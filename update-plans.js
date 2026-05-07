require('dotenv').config();
const db = require('./src/models');

async function updatePlans() {
    try {
        console.log('🔄 Updating Business Plans to match new Feature Matrix...');

        const plans = [
            {
                name: 'Essential',
                features: [
                    'pos_billing', 'inventory_basic', 'inventory_po', 'accounting_basic', 
                    'accounting_ledger_supplier', 'accounting_ledger_customer', 'staff_management', 
                    'shift_management', 'system_backup', 'barcode_customization', 'reports_basic', 
                    'dashboard_kpi_live', 'dashboard_health'
                ]
            },
            {
                name: 'Professional',
                features: [
                    'dashboard_kpi_live', 'dashboard_health', 'dashboard_custom', 'reports_basic', 
                    'reports_advanced', 'pos_billing', 'pos_advanced', 'invoice_customization', 
                    'pos_payments', 'pos_offline', 'inventory_basic', 'inventory_advanced', 
                    'inventory_ledger', 'inventory_po', 'inventory_transfers', 'accounting_basic', 
                    'accounting_advanced', 'accounting_ledger_manual', 'accounting_ledger_supplier', 
                    'accounting_ledger_customer', 'accounting_reconciliation', 'staff_management', 
                    'shift_management', 'multi_location', 'barcode_customization', 'system_backup', 
                    'data_export'
                ]
            },
            {
                name: 'Enterprise',
                features: ['all_features']
            }
        ];

        for (const plan of plans) {
            const [affectedCount] = await db.BusinessPlan.update(
                { features: plan.features },
                { where: { name: plan.name } }
            );
            console.log(`✅ Updated ${plan.name} plan features. (${affectedCount} record(s))`);
        }

        console.log('✨ All plans updated successfully.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to update plans:', error);
        process.exit(1);
    }
}

updatePlans();
