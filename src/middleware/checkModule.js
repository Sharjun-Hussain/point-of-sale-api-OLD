const { BusinessPlan } = require('../models');

/**
 * Middleware to check if a module is enabled for the organization
 * @param {string} moduleKey - The key of the module to check
 */
const checkModule = (moduleKey) => {
    return async (req, res, next) => {
        try {
            if (!req.user || !req.user.organization) return next();

            const organization = req.user.organization;
            
            // 0. Master & Super Admin Bypass
            const isSuperAdmin = req.user.roles?.some(role => role.name === 'Super Admin');
            if (isSuperAdmin || organization.is_master) return next();

            // 1. Check Module Overrides (JSON array)
            const overrides = organization.module_overrides || [];
            if (overrides.includes(moduleKey) || overrides.includes('all_features')) return next();

            // 2. Check Plan Features
            const plan = organization.plan;
            const planFeatures = plan?.features || [];
            if (planFeatures.includes(moduleKey) || planFeatures.includes('all_features')) return next();

            // 3. Tier-based Fallback
            const tier = organization.subscription_tier;
            if (tier === 'Enterprise') return next();

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
                if (proFeatures.includes(moduleKey)) return next();
            }

            if (tier === 'Essential') {
                const essentialFeatures = [
                    'pos_billing', 'inventory_basic', 'inventory_po', 'accounting_basic',
                    'accounting_ledger_supplier', 'accounting_ledger_customer', 'staff_management',
                    'barcode_customization', 'reports_basic',
                    'dashboard_kpi_live', 'dashboard_health'
                ];
                if (essentialFeatures.includes(moduleKey)) return next();
            }

            return res.status(403).json({
                status: 'error',
                message: `Upgrade Required: The '${moduleKey.replace(/_/g, ' ')}' module is not included in your current plan.`,
                code: 'MODULE_NOT_ENABLED'
            });

        } catch (error) {
            next(error);
        }
    };
};

module.exports = checkModule;
