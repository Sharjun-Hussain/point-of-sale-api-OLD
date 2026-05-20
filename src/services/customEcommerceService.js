const { Setting, Product, ProductVariant, Branch, Stock } = require('../models');
const { decrypt } = require('../utils/security');
const logger = require('../utils/logger');

class CustomEcommerceService {
    /**
     * Fetch settings securely for an organization
     */
    async _getFullConfig(organizationId) {
        try {
            const setting = await Setting.findOne({
                where: {
                    organization_id: organizationId,
                    category: 'custom_ecommerce',
                    branch_id: null
                }
            });
            if (!setting || !setting.settings_data) return null;

            let data = setting.settings_data;
            if (typeof data === 'string') {
                try {
                    data = JSON.parse(data);
                } catch (e) {
                    return null;
                }
            }

            // Cleanup potentialspread errors (defensive parser matching Shopify implementation)
            if (data && typeof data === 'object') {
                const cleaned = {};
                Object.keys(data).forEach(key => {
                    if (key !== '0' && key !== '1') {
                        cleaned[key] = data[key];
                    }
                });
                data = cleaned;
            }

            // Decrypt the token securely
            if (data.api_token) {
                data.api_token = decrypt(data.api_token);
            }
            return data;
        } catch (error) {
            logger.error(`Error fetching custom e-commerce config: ${error.message}`);
            return null;
        }
    }

    /**
     * Sync inventory from POS to custom e-commerce webhook for a SKU
     */
    async syncInventory(organizationId, sku, quantityChange) {
        try {
            const config = await this._getFullConfig(organizationId);
            if (!config || !config.enabled || !config.api_url) return;

            // 1. Resolve product variant and parent product
            const variant = await ProductVariant.findOne({
                where: { sku, organization_id: organizationId },
                include: [{ model: Product, as: 'product' }]
            });

            // If product has custom ecommerce sync disabled, skip
            if (!variant || !variant.product || !variant.product.custom_ecommerce_sync_enabled) {
                return;
            }

            // 2. Fetch the absolute stock for the mapped branch
            let branchId = config.pos_branch_id;
            if (!branchId) {
                // Fallback to main branch
                const mainBranch = await Branch.findOne({
                    where: { organization_id: organizationId, is_main: true }
                });
                branchId = mainBranch ? mainBranch.id : null;
            }

            if (!branchId) return;

            const stockRecord = await Stock.findOne({
                where: {
                    organization_id: organizationId,
                    branch_id: branchId,
                    product_variant_id: variant.id
                }
            });
            const absoluteStock = stockRecord ? parseFloat(stockRecord.quantity) : 0;

            // 3. Dispatch HTTP Post trigger to the client's custom API
            const response = await fetch(`${config.api_url.replace(/\/$/, '')}/api/webhooks/pos-inventory-sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.api_token}`
                },
                body: JSON.stringify({
                    sku: sku,
                    change_amount: parseFloat(quantityChange),
                    absolute_stock: Math.max(0, Math.floor(absoluteStock)),
                    updated_at: new Date().toISOString()
                }),
                signal: AbortSignal.timeout(8000)
            });

            if (!response.ok) {
                logger.error(`Custom E-commerce Sync Failed for SKU ${sku}: HTTP ${response.status} ${response.statusText}`);
            } else {
                logger.info(`Custom E-commerce Sync: Broadcasted SKU ${sku} update successfully.`);
            }
        } catch (error) {
            logger.error(`Custom E-commerce Outbound Sync Error: ${error.message}`);
        }
    }

    /**
     * Push ALL local inventory (for custom e-commerce enabled products) to custom store
     */
    async pushAllInventory(organizationId) {
        try {
            const config = await this._getFullConfig(organizationId);
            if (!config || !config.enabled || !config.api_url) {
                throw new Error('Custom E-commerce is not properly configured or enabled.');
            }

            let branchId = config.pos_branch_id;
            if (!branchId) {
                const mainBranch = await Branch.findOne({
                    where: { organization_id: organizationId, is_main: true }
                });
                branchId = mainBranch ? mainBranch.id : null;
            }

            if (!branchId) throw new Error('No POS branch mapped for stock sourcing.');

            // Find all variants belonging to products with sync enabled
            const variants = await ProductVariant.findAll({
                where: { organization_id: organizationId },
                include: [
                    {
                        model: Product,
                        as: 'product',
                        where: { custom_ecommerce_sync_enabled: true }
                    },
                    {
                        model: Stock,
                        as: 'stocks',
                        where: { organization_id: organizationId, branch_id: branchId },
                        required: false
                    }
                ]
            });

            const results = { total: variants.length, pushed: 0, failed: 0, skipped: 0 };

            for (const variant of variants) {
                const sku = variant.sku || variant.barcode;
                if (!sku) {
                    results.skipped++;
                    continue;
                }

                const totalStock = variant.stocks.reduce((sum, s) => sum + parseFloat(s.quantity), 0);

                try {
                    const response = await fetch(`${config.api_url.replace(/\/$/, '')}/api/webhooks/pos-inventory-sync`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${config.api_token}`
                        },
                        body: JSON.stringify({
                            sku: sku,
                            change_amount: 0,
                            absolute_stock: Math.max(0, Math.floor(totalStock)),
                            updated_at: new Date().toISOString()
                        }),
                        signal: AbortSignal.timeout(8000)
                    });

                    if (response.ok) {
                        results.pushed++;
                    } else {
                        results.failed++;
                    }
                } catch (err) {
                    results.failed++;
                    logger.error(`Failed to push SKU ${sku}: ${err.message}`);
                }
            }

            return { success: true, results };
        } catch (error) {
            logger.error(`Custom E-commerce bulk push failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new CustomEcommerceService();
