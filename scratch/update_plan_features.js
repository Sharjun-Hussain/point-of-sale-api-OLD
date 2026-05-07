require('dotenv').config();
const { BusinessPlan } = require('../src/models');

async function updatePlans() {
    try {
        console.log('🔄 Updating Business Plan features in DB...');
        
        const essentialFeatures = [
            'pos_billing', 'inventory_basic', 'inventory_po', 'staff_management', 
            'barcode_customization', 'reports_basic', 'dashboard_kpi_live', 'dashboard_health'
        ];
        
        const professionalFeatures = [
            'dashboard_kpi_live', 'dashboard_health', 'dashboard_custom', 'reports_basic',
            'reports_advanced', 'pos_billing', 'pos_advanced', 'invoice_customization',
            'pos_payments', 'pos_offline', 'inventory_basic', 'inventory_advanced',
            'inventory_ledger', 'inventory_po', 'inventory_transfers', 'accounting_basic',
            'accounting_advanced', 'accounting_ledger_manual', 'accounting_ledger_supplier',
            'accounting_ledger_customer', 'accounting_reconciliation', 'staff_management',
            'multi_location', 'barcode_customization', 'backup_manual', 'data_export'
        ];

        await BusinessPlan.update({ features: essentialFeatures }, { where: { name: 'Essential' } });
        await BusinessPlan.update({ features: professionalFeatures }, { where: { name: 'Professional' } });

        console.log('✅ Plans updated successfully.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Update failed:', error);
        process.exit(1);
    }
}

updatePlans();
