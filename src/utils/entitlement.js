/**
 * Entitlement Utilities
 */

const getModuleAccess = (organization, moduleKey) => {
    // 0. Master Bypass
    if (organization.is_master) return true;

    // 1. Check Module Overrides (JSON array)
    const overrides = organization.module_overrides || [];
    if (overrides.includes(moduleKey) || overrides.includes('all_features')) return true;

    // 2. Check Plan Features
    const planFeatures = organization.plan?.features || [];
    if (planFeatures.includes(moduleKey) || planFeatures.includes('all_features')) return true;

    // 3. Tier-based Fallback
    const tier = organization.subscription_tier;
    if (tier === 'Enterprise') return true;

    if (tier === 'Professional') {
        const proFeatures = [
            'dashboard_kpi_live', 'dashboard_health', 'dashboard_custom', 'reports_basic',
            'reports_advanced', 'pos_billing', 'pos_advanced', 'invoice_customization',
            'pos_payments', 'pos_offline', 'inventory_basic', 'inventory_advanced',
            'inventory_ledger', 'inventory_po', 'inventory_transfers', 'accounting_basic',
            'accounting_advanced', 'accounting_ledger_manual', 'accounting_ledger_supplier',
            'accounting_ledger_customer', 'accounting_reconciliation', 'staff_management',
            'multi_location', 'barcode_customization', 'backup_manual', 'data_export'
        ];
        return proFeatures.includes(moduleKey);
    }

    if (tier === 'Essential') {
        const essentialFeatures = [
            'pos_billing', 'inventory_basic', 'inventory_po', 'accounting_basic',
            'accounting_ledger_supplier', 'accounting_ledger_customer', 'staff_management',
            'barcode_customization', 'reports_basic',
            'dashboard_kpi_live', 'dashboard_health'
        ];
        return essentialFeatures.includes(moduleKey);
    }

    return false;
};

module.exports = { getModuleAccess };
