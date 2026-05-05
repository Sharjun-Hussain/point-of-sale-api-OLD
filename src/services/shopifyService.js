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

            // Validate token prefix — shpss_ is a Client Secret, NOT an access token
            if (access_token.startsWith('shpss_')) {
                throw new Error(
                    'Invalid token type: shpss_ is a Client Secret, not an Access Token. ' +
                    'Please generate a shpat_ token from Shopify Admin → Settings → Apps → Develop Apps → Install App → Reveal Token.'
                );
            }

            // Normalize shop URL (strip protocol if accidentally included)
            const cleanShopUrl = shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '');

            let response;
            try {
                response = await fetch(`https://${cleanShopUrl}/admin/api/2024-10/shop.json`, {
                    headers: {
                        'X-Shopify-Access-Token': access_token,
                        'Content-Type': 'application/json'
                    },
                    signal: AbortSignal.timeout(10000) // 10s timeout
                });
            } catch (fetchErr) {
                // Network-level failure (DNS, firewall, TLS)
                throw new Error(`Network error reaching Shopify: ${fetchErr.cause?.code || fetchErr.message}. Check that the server has outbound HTTPS access to ${cleanShopUrl}.`);
            }

            if (response.status === 401) {
                throw new Error('Authentication failed (401): Access token is invalid or has been revoked. Generate a new shpat_ token from Shopify Admin.');
            }
            if (response.status === 403) {
                throw new Error('Permission denied (403): Access token lacks required scopes. Ensure read_products and read_inventory scopes are enabled.');
            }
            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({}));
                throw new Error(`Shopify API error (${response.status}): ${errorBody.errors || 'Unknown error'}`);
            }

            const data = await response.json();
            return { success: true, shop: data.shop };
        } catch (error) {
            logger.error(`Shopify Connection Error: ${error.message}`);
            return { success: false, message: error.message };
        }
    }

    /**
     * Sync inventory and price for a specific SKU (Real-time)
     */
    async syncInventory(organizationId, sku, quantityChange) {
        try {
            const config = await this.getConfig(organizationId);
            if (!config || !config.enabled) return;

            const { shop_url, access_token, location_id } = config;
            if (!shop_url || !access_token || !location_id) return;

            // 1. Fetch Local Variant Data (Including latest batch for smart pricing)
            const localVariant = await ProductVariant.findOne({
                where: { sku: sku, organization_id: organizationId },
                include: [{
                    model: Product.sequelize.models.ProductBatch,
                    as: 'batches',
                    where: { is_active: true },
                    order: [['created_at', 'DESC']],
                    limit: 1
                }]
            });

            if (!localVariant || !localVariant.shopify_sync_enabled) {
                logger.info(`Shopify Sync skipped: Variant ${sku} is not enabled for Shopify sync.`);
                return;
            }

            // 2. Find Shopify Inventory Item
            const itemResponse = await fetch(`https://${shop_url}/admin/api/2024-04/inventory_items.json?sku=${sku}`, {
                headers: { 'X-Shopify-Access-Token': access_token }
            });
            const itemData = await itemResponse.json();
            const invItem = itemData.inventory_items?.[0];

            if (!invItem) {
                logger.warn(`Shopify Sync: No product found on Shopify with SKU ${sku}`);
                return;
            }

            // 3. Update Price on Shopify (Optional: If we want to keep prices in sync real-time)
            const latestBatch = localVariant.batches?.[0];
            const retailPrice = latestBatch ? latestBatch.selling_price : localVariant.price;
            
            // We'd need variant_id to update price. For simplicity, we focus on stock adjust.
            // (If variant_id is stored in DB, we'd use it here)

            // 4. Adjust inventory level
            const adjustResponse = await fetch(`https://${shop_url}/admin/api/2024-04/inventory_levels/adjust.json`, {
                method: 'POST',
                headers: {
                    'X-Shopify-Access-Token': access_token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    location_id: location_id,
                    inventory_item_id: invItem.id,
                    available_adjustment: Math.round(quantityChange)
                })
            });

            if (adjustResponse.ok) {
                logger.info(`Shopify Sync: Adjusted ${sku} by ${quantityChange}`);
            }
        } catch (error) {
            logger.error(`Shopify Real-time Sync Error (SKU: ${sku}): ${error.message}`);
        }
    }

    /**
     * Get local products and variants with Shopify sync status
     */
    async getLocalProducts(organizationId) {
        try {
            return await Product.findAll({
                where: { organization_id: organizationId },
                attributes: ['id', 'name', 'code'],
                include: [{
                    model: ProductVariant,
                    as: 'variants',
                    attributes: ['id', 'name', 'sku', 'price', 'shopify_sync_enabled']
                }],
                order: [['name', 'ASC']]
            });
        } catch (error) {
            logger.error(`Get Local Products Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update sync status for multiple variants
     */
    async updateProductSyncStatus(organizationId, variantIds, enabled) {
        try {
            return await ProductVariant.update(
                { shopify_sync_enabled: enabled },
                { 
                    where: { 
                        id: variantIds,
                        organization_id: organizationId 
                    } 
                }
            );
        } catch (error) {
            logger.error(`Update Variant Sync Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Push enabled variants to Shopify (Bulk)
     */
    async pushAllInventory(organizationId) {
        try {
            const config = await this.getConfig(organizationId);
            if (!config) throw new Error('Shopify not configured');

            const { shop_url, access_token, location_id } = config;

            const variants = await ProductVariant.findAll({
                where: { 
                    organization_id: organizationId,
                    shopify_sync_enabled: true
                },
                include: [
                    { model: Setting.sequelize.models.Stock, as: 'stocks', where: { organization_id: organizationId } },
                    { model: Setting.sequelize.models.ProductBatch, as: 'batches', where: { is_active: true }, order: [['created_at', 'DESC']] },
                    { model: Product, as: 'product' }
                ]
            });

            const results = { total: variants.length, pushed: 0, failed: 0, skipped: 0 };
            
            for (const variant of variants) {
                const sku = variant.sku || variant.barcode || variant.product?.code;
                if (!sku) { results.skipped++; continue; }

                const totalStock = variant.stocks.reduce((sum, s) => sum + parseFloat(s.quantity), 0);
                const latestBatch = variant.batches?.[0];
                const retailPrice = latestBatch ? latestBatch.selling_price : variant.price;

                try {
                    const itemResponse = await fetch(`https://${shop_url}/admin/api/2024-04/inventory_items.json?sku=${sku}`, {
                        headers: { 'X-Shopify-Access-Token': access_token }
                    });
                    const itemData = await itemResponse.json();
                    const shopifyItem = itemData.inventory_items?.[0];

                    if (!shopifyItem) { results.skipped++; continue; }

                    // Set Stock
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
                    logger.error(`Push Error (SKU: ${sku}): ${err.message}`);
                }
            }

            return results;
        } catch (error) {
            logger.error(`Selective Push Error: ${error.message}`);
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

            const productCountRes = await fetch(`https://${shop_url}/admin/api/2024-04/products/count.json`, {
                headers: { 'X-Shopify-Access-Token': access_token }
            });
            const { count: productCount } = await productCountRes.json();

            const orderCountRes = await fetch(`https://${shop_url}/admin/api/2024-04/orders/count.json?status=any`, {
                headers: { 'X-Shopify-Access-Token': access_token }
            });
            const { count: orderCount } = await orderCountRes.json();

            // Local Stats: Variants ENABLED for Shopify sync
            const linkedVariants = await ProductVariant.count({
                where: { 
                    organization_id: organizationId,
                    shopify_sync_enabled: true
                }
            });

            return {
                shopify_products: productCount || 0,
                shopify_orders: orderCount || 0,
                linked_local_variants: linkedVariants || 0,
                sync_status: config.enabled ? 'Active' : 'Paused',
                last_checked: new Date()
            };
        } catch (error) {
            logger.error(`Shopify Analytics Error: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new ShopifyService();
