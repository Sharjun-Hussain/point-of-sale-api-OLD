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
     * Register webhooks on Shopify
     */
    async registerWebhooks(organizationId) {
        // Implementation for registering orders/create, products/update, etc.
    }
}

module.exports = new ShopifyService();
