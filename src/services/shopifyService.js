const { Setting, Product, ProductVariant, Organization } = require('../models');
const logger = require('../utils/logger');

class ShopifyService {
    /**
     * Get Shopify configuration for an organization
     */
    async getConfig(organizationId) {
        const setting = await Setting.findOne({
            where: {
                organization_id: organizationId,
                category: 'shopify'
            }
        });

        if (!setting || !setting.settings_data) return null;
        return setting.settings_data;
    }

    /**
     * Verify connection to Shopify Admin API
     */
    async verifyConnection(config) {
        try {
            const { shop_url, access_token } = config;
            if (!shop_url || !access_token) {
                throw new Error('Shop URL and Access Token are required');
            }

            const response = await fetch(`https://${shop_url}/admin/api/2024-04/shop.json`, {
                headers: {
                    'X-Shopify-Access-Token': access_token,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.errors || 'Failed to connect to Shopify');
            }

            const data = await response.json();
            return { success: true, shop: data.shop };
        } catch (error) {
            logger.error(`Shopify Connection Error: ${error.message}`);
            return { success: false, message: error.message };
        }
    }

    /**
     * Sync inventory for a specific SKU
     */
    async syncInventory(organizationId, sku, quantityChange) {
        try {
            const config = await this.getConfig(organizationId);
            if (!config || !config.enabled) return;

            const { shop_url, access_token, location_id } = config;
            if (!shop_url || !access_token || !location_id) {
                logger.warn(`Shopify sync skipped for Org ${organizationId}: Missing configuration`);
                return;
            }

            // 1. Find the inventory_item_id on Shopify by SKU
            const itemResponse = await fetch(`https://${shop_url}/admin/api/2024-04/inventory_items.json?sku=${sku}`, {
                headers: { 
                    'X-Shopify-Access-Token': access_token,
                    'Content-Type': 'application/json'
                }
            });

            if (!itemResponse.ok) {
                logger.error(`Shopify Item Search Failed: ${itemResponse.statusText}`);
                return;
            }

            const itemData = await itemResponse.json();
            const inventoryItem = itemData.inventory_items?.[0];

            if (!inventoryItem) {
                logger.warn(`Shopify Sync: No product found with SKU ${sku}`);
                return;
            }

            const inventoryItemId = inventoryItem.id;

            // 2. Adjust inventory level
            const adjustResponse = await fetch(`https://${shop_url}/admin/api/2024-04/inventory_levels/adjust.json`, {
                method: 'POST',
                headers: {
                    'X-Shopify-Access-Token': access_token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    location_id: location_id,
                    inventory_item_id: inventoryItemId,
                    available_adjustment: Math.round(quantityChange)
                })
            });

            if (!adjustResponse.ok) {
                const err = await adjustResponse.json();
                logger.error(`Shopify Adjustment Failed for SKU ${sku}: ${JSON.stringify(err.errors)}`);
            } else {
                logger.info(`Shopify Sync Success: Adjusted SKU ${sku} by ${quantityChange}`);
            }
            
        } catch (error) {
            logger.error(`Shopify Sync Error (SKU: ${sku}): ${error.message}`);
        }
    }

    /**
     * Push all local inventory to Shopify
     */
    async pushAllInventory(organizationId) {
        try {
            const config = await this.getConfig(organizationId);
            if (!config) throw new Error('Shopify not configured');

            const { shop_url, access_token, location_id } = config;

            // 1. Get all local variants with SKUs
            const variants = await ProductVariant.findAll({
                where: { organization_id: organizationId },
                include: [{
                    model: Setting.sequelize.models.Stock,
                    as: 'stocks',
                    where: { organization_id: organizationId }
                }]
            });

            const results = { total: variants.length, pushed: 0, failed: 0, skipped: 0 };

            for (const variant of variants) {
                const sku = variant.sku || variant.barcode;
                if (!sku) {
                    results.skipped++;
                    continue;
                }

                // Calculate total stock across all branches
                const totalStock = variant.stocks.reduce((sum, s) => sum + parseFloat(s.quantity), 0);

                try {
                    // Find Shopify Item
                    const itemResponse = await fetch(`https://${shop_url}/admin/api/2024-04/inventory_items.json?sku=${sku}`, {
                        headers: { 'X-Shopify-Access-Token': access_token }
                    });
                    const itemData = await itemResponse.json();
                    const shopifyItem = itemData.inventory_items?.[0];

                    if (!shopifyItem) {
                        results.skipped++;
                        continue;
                    }

                    // Set inventory level (absolute)
                    const setResponse = await fetch(`https://${shop_url}/admin/api/2024-04/inventory_levels/set.json`, {
                        method: 'POST',
                        headers: {
                            'X-Shopify-Access-Token': access_token,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            location_id: location_id,
                            inventory_item_id: shopifyItem.id,
                            available: Math.round(totalStock)
                        })
                    });

                    if (setResponse.ok) results.pushed++;
                    else results.failed++;

                } catch (err) {
                    results.failed++;
                    logger.error(`Push Sync Error for SKU ${sku}: ${err.message}`);
                }
            }

            return results;
        } catch (error) {
            logger.error(`Bulk Push Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Pull products from Shopify (Simplified sync)
     */
    async pullAllProducts(organizationId) {
        try {
            const config = await this.getConfig(organizationId);
            if (!config) throw new Error('Shopify not configured');

            const { shop_url, access_token } = config;

            // Fetch products from Shopify
            const response = await fetch(`https://${shop_url}/admin/api/2024-04/products.json?limit=250`, {
                headers: { 'X-Shopify-Access-Token': access_token }
            });
            const data = await response.json();
            
            return { total: data.products?.length || 0, products: data.products || [] };
        } catch (error) {
            logger.error(`Bulk Pull Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get basic analytics from Shopify
     */
    async getAnalytics(organizationId) {
        try {
            const config = await this.getConfig(organizationId);
            if (!config) throw new Error('Shopify not configured');

            const { shop_url, access_token } = config;

            // 1. Fetch Product Count
            const productCountRes = await fetch(`https://${shop_url}/admin/api/2024-04/products/count.json`, {
                headers: { 'X-Shopify-Access-Token': access_token }
            });
            const { count: productCount } = await productCountRes.json();

            // 2. Fetch Order Count (Recent)
            const orderCountRes = await fetch(`https://${shop_url}/admin/api/2024-04/orders/count.json?status=any`, {
                headers: { 'X-Shopify-Access-Token': access_token }
            });
            const { count: orderCount } = await orderCountRes.json();

            // 3. Local Stats: Items with SKUs
            const linkedProducts = await ProductVariant.count({
                where: { 
                    organization_id: organizationId,
                    sku: { [require('sequelize').Op.ne]: null }
                }
            });

            return {
                shopify_products: productCount || 0,
                shopify_orders: orderCount || 0,
                linked_local_variants: linkedProducts || 0,
                sync_status: config.enabled ? 'Active' : 'Paused',
                last_checked: new Date()
            };
        } catch (error) {
            logger.error(`Shopify Analytics Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Register webhooks on Shopify
     */
    async registerWebhooks(organizationId) {
        // Implementation for registering orders/create, products/update, etc.
    }
}

module.exports = new ShopifyService();
