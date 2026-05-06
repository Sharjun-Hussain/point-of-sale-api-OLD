const { Setting, Product, ProductVariant, Organization } = require('../models');
const logger = require('../utils/logger');
const tokenManager = require('./shopifyTokenManager');
const { decrypt } = require('../utils/security');

class ShopifyService {
    /**
     * Get Shopify configuration for an organization
     */
    async getConfig(organizationId) {
        const config = await this._getFullConfig(organizationId);
        if (!config) return null;

        // Verify if the stored credentials actually work
        const verification = await this.verifyConnection({
            shop_url: config.shop_url,
            access_token: config.access_token
        });

        // Strip client_secret for public response
        const { client_secret, ...safeConfig } = config;
        
        return {
            ...safeConfig,
            connected: verification.success,
            shop_name: verification.shop?.name || null
        };
    }

    /**
     * Get full config including credentials (internal use only)
     */
    async _getFullConfig(organizationId) {
        // 1. Check if organization has Shopify enabled at the master level
        const org = await Organization.findByPk(organizationId, {
            attributes: ['id', 'shopify_enabled']
        });

        if (!org || !org.shopify_enabled) {
            return null;
        }

        // 2. Fetch specific Shopify settings
        const setting = await Setting.findOne({
            where: { 
                organization_id: organizationId, 
                category: 'shopify',
                branch_id: null
            }
        });
        
        if (!setting) return null;

        // Ensure we have a clean object
        let rawData = setting.get('settings_data');
        if (typeof rawData === 'string') {
            try {
                rawData = JSON.parse(rawData);
            } catch (e) {
                logger.error(`Shopify: Failed to parse settings_data: ${e.message}`);
                return null;
            }
        }
        
        if (!rawData || typeof rawData !== 'object') return null;

        // Defensive cleanup: If data has numeric keys (corrupted string-spread), reconstruct it
        if (rawData['0'] !== undefined) {
            const keys = Object.keys(rawData).filter(k => !isNaN(k)).sort((a, b) => Number(a) - Number(b));
            const jsonStr = keys.map(k => rawData[k]).join('');
            try {
                rawData = JSON.parse(jsonStr);
            } catch (e) {
                logger.error(`Shopify: Failed to reconstruct corrupted settings: ${e.message}`);
                return null;
            }
        }

        const config = { ...rawData };
        if (config.access_token) config.access_token = decrypt(config.access_token);
        if (config.client_secret) config.client_secret = decrypt(config.client_secret);
        
        return config;
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
            const config = await this._getFullConfig(organizationId);
            if (!config || !config.enabled) return;

            const { shop_url, location_id } = config;
            if (!shop_url || !location_id) return;

            // Get a valid (auto-refreshed) token
            const access_token = await tokenManager.getValidToken(organizationId);
            if (!access_token) {
                logger.warn(`Shopify Sync skipped: No valid token for org ${organizationId}`);
                return;
            }

            const cleanShopUrl = shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '');

            // 1. Fetch Local Variant Data
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

            // 2. Find Shopify Inventory Item by SKU
            const itemResponse = await fetch(`https://${cleanShopUrl}/admin/api/2024-10/inventory_items.json?sku=${sku}`, {
                headers: { 'X-Shopify-Access-Token': access_token },
                signal: AbortSignal.timeout(10000)
            });
            const itemData = await itemResponse.json();
            const invItem = itemData.inventory_items?.[0];

            if (!invItem) {
                logger.warn(`Shopify Sync: No product found on Shopify with SKU ${sku}`);
                return;
            }

            // 3. Adjust inventory level
            const adjustResponse = await fetch(`https://${cleanShopUrl}/admin/api/2024-10/inventory_levels/adjust.json`, {
                method: 'POST',
                headers: {
                    'X-Shopify-Access-Token': access_token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    location_id: parseInt(location_id),
                    inventory_item_id: invItem.id,
                    available_adjustment: Math.round(quantityChange)
                }),
                signal: AbortSignal.timeout(10000)
            });

            if (adjustResponse.ok) {
                logger.info(`Shopify Sync: Adjusted ${sku} by ${quantityChange}`);
            } else {
                const errBody = await adjustResponse.json().catch(() => ({}));
                logger.error(`Shopify Sync adjust failed for ${sku}: ${JSON.stringify(errBody)}`);
            }
        } catch (error) {
            logger.error(`Shopify Real-time Sync Error (SKU: ${sku}): ${error.message}`);
        }
    }

    /**
     * Get local products and variants with Shopify sync status (Paginated)
     */
    async getLocalProducts(organizationId, page = 1, limit = 10) {
        try {
            const offset = (page - 1) * limit;
            const { count, rows } = await Product.findAndCountAll({
                where: { organization_id: organizationId },
                attributes: ['id', 'name', 'code'],
                include: [{
                    model: ProductVariant,
                    as: 'variants',
                    attributes: ['id', 'name', 'sku', 'price', 'shopify_sync_enabled']
                }],
                order: [['name', 'ASC']],
                limit: parseInt(limit),
                offset: parseInt(offset),
                distinct: true // Ensure count is correct with includes
            });

            return {
                data: rows,
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(count / limit)
            };
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
            const config = await this._getFullConfig(organizationId);
            if (!config) throw new Error('Shopify not configured');

            const { shop_url, location_id } = config;
            const cleanShopUrl = shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '');

            // Get a valid (auto-refreshed) token
            const access_token = await tokenManager.getValidToken(organizationId);
            if (!access_token) throw new Error('Could not obtain a valid Shopify access token. Please check your credentials.');

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

                try {
                    const itemResponse = await fetch(`https://${cleanShopUrl}/admin/api/2024-10/inventory_items.json?sku=${encodeURIComponent(sku)}`, {
                        headers: { 'X-Shopify-Access-Token': access_token },
                        signal: AbortSignal.timeout(10000)
                    });
                    const itemData = await itemResponse.json();
                    const shopifyItem = itemData.inventory_items?.[0];

                    if (!shopifyItem) { results.skipped++; continue; }

                    // Set Stock
                    const setResponse = await fetch(`https://${cleanShopUrl}/admin/api/2024-10/inventory_levels/set.json`, {
                        method: 'POST',
                        headers: {
                            'X-Shopify-Access-Token': access_token,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            location_id: parseInt(location_id),
                            inventory_item_id: shopifyItem.id,
                            available: Math.round(totalStock)
                        }),
                        signal: AbortSignal.timeout(10000)
                    });

                    if (setResponse.ok) results.pushed++;
                    else {
                        const errBody = await setResponse.json().catch(() => ({}));
                        logger.error(`Push Set failed (SKU: ${sku}): ${JSON.stringify(errBody)}`);
                        results.failed++;
                    }
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
            const config = await this._getFullConfig(organizationId);
            if (!config) throw new Error('Shopify not configured');

            const { shop_url } = config;
            if (!shop_url) throw new Error('Shopify shop URL is not configured. Please save your settings first.');
            const cleanShopUrl = shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '');

            // Get a valid (auto-refreshed) token
            const access_token = await tokenManager.getValidToken(organizationId);
            if (!access_token) throw new Error('No valid Shopify token available');

            let productCount = 0;
            try {
                const productCountRes = await fetch(`https://${cleanShopUrl}/admin/api/2024-10/products/count.json`, {
                    headers: { 'X-Shopify-Access-Token': access_token },
                    signal: AbortSignal.timeout(10000)
                });
                if (productCountRes.ok) {
                    const pcData = await productCountRes.json();
                    productCount = pcData.count || 0;
                } else {
                    logger.error(`Shopify Product Count failed: ${productCountRes.status}`);
                }
            } catch (pcErr) {
                logger.error(`Shopify Product Count error: ${pcErr.message}`);
            }

            let orderCount = 0;
            try {
                const orderCountRes = await fetch(`https://${cleanShopUrl}/admin/api/2024-10/orders/count.json?status=any`, {
                    headers: { 'X-Shopify-Access-Token': access_token },
                    signal: AbortSignal.timeout(10000)
                });
                if (orderCountRes.ok) {
                    const ocData = await orderCountRes.json();
                    orderCount = ocData.count || 0;
                } else {
                    logger.error(`Shopify Order Count failed: ${orderCountRes.status}`);
                }
            } catch (ocErr) {
                logger.error(`Shopify Order Count error: ${ocErr.message}`);
            }

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

    /**
     * Fetch products directly from Shopify Admin API and check for local links
     */
    async getShopifyProducts(organizationId) {
        try {
            const config = await this._getFullConfig(organizationId);
            if (!config) throw new Error('Shopify not configured');

            const { shop_url } = config;
            const access_token = await tokenManager.getValidToken(organizationId);
            if (!access_token) throw new Error('No valid Shopify token available');

            const cleanShopUrl = shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '');
            const response = await fetch(`https://${cleanShopUrl}/admin/api/2024-10/products.json?limit=50`, {
                headers: { 'X-Shopify-Access-Token': access_token },
                signal: AbortSignal.timeout(15000)
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(`Shopify API Error: ${JSON.stringify(err.errors || 'Unknown error')}`);
            }

            const data = await response.json();
            const shopifyProducts = data.products || [];

            // Cross-reference with local products by SKU
            const skus = shopifyProducts.flatMap(p => p.variants?.map(v => v.sku)).filter(Boolean);
            const localVariants = await ProductVariant.findAll({
                where: { 
                    organization_id: organizationId,
                    sku: skus
                },
                attributes: ['id', 'sku', 'name', 'price', 'shopify_sync_enabled'],
                include: [{ model: Product, as: 'product', attributes: ['name'] }]
            });

            const localSkuMap = localVariants.reduce((map, v) => {
                map[v.sku] = v;
                return map;
            }, {});

            // Append local link info
            const enrichedProducts = shopifyProducts.map(p => ({
                ...p,
                local_match: p.variants?.map(v => localSkuMap[v.sku] || null).find(m => m !== null) || null
            }));

            return enrichedProducts;
        } catch (error) {
            logger.error(`Get Shopify Products Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Fetch recent orders directly from Shopify Admin API
     */
    async getShopifyOrders(organizationId) {
        try {
            const config = await this._getFullConfig(organizationId);
            if (!config) throw new Error('Shopify not configured');

            const { shop_url } = config;
            const access_token = await tokenManager.getValidToken(organizationId);
            if (!access_token) throw new Error('No valid Shopify token available');

            const cleanShopUrl = shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '');
            const response = await fetch(`https://${cleanShopUrl}/admin/api/2024-10/orders.json?limit=50&status=any`, {
                headers: { 'X-Shopify-Access-Token': access_token },
                signal: AbortSignal.timeout(15000)
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(`Shopify API Error: ${JSON.stringify(err.errors || 'Unknown error')}`);
            }

            const data = await response.json();
            return data.orders || [];
        } catch (error) {
            logger.error(`Get Shopify Orders Error: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new ShopifyService();
