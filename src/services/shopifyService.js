const { Setting, Product, ProductVariant, Organization, Branch, Stock } = require('../models');
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

            const cleanShopUrl = shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '');
            const response = await fetch(`https://${cleanShopUrl}/admin/api/2024-10/shop.json`, {
                headers: {
                    'X-Shopify-Access-Token': access_token
                },
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                return {
                    success: false,
                    error: err.errors || 'Unauthorized'
                };
            }

            const data = await response.json();
            return {
                success: true,
                shop: data.shop
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Sync inventory from POS to Shopify for a specific product
     */
    async syncInventory(organizationId, sku, quantityChange) {
        try {
            const config = await this._getFullConfig(organizationId);
            if (!config || !config.enabled || !config.location_id) return;

            const access_token = await tokenManager.getValidToken(organizationId);
            const cleanShopUrl = config.shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '');

            // 1. Find the inventory item ID for this SKU
            const itemResponse = await fetch(`https://${cleanShopUrl}/admin/api/2024-10/inventory_items.json?sku=${encodeURIComponent(sku)}`, {
                headers: { 'X-Shopify-Access-Token': access_token },
                signal: AbortSignal.timeout(10000)
            });

            if (!itemResponse.ok) return;

            const itemData = await itemResponse.json();
            const shopifyItem = itemData.inventory_items?.[0];

            if (!shopifyItem) return;

            // 2. Adjust inventory level
            await fetch(`https://${cleanShopUrl}/admin/api/2024-10/inventory_levels/adjust.json`, {
                method: 'POST',
                headers: {
                    'X-Shopify-Access-Token': access_token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    location_id: config.location_id,
                    inventory_item_id: shopifyItem.id,
                    available_adjustment: Math.floor(quantityChange)
                }),
                signal: AbortSignal.timeout(10000)
            });

            logger.info(`Shopify Sync: Adjusted SKU ${sku} by ${quantityChange}`);
        } catch (error) {
            logger.error(`Shopify Sync Error: ${error.message}`);
        }
    }

    /**
     * Get products that are not yet linked to Shopify
     */
    async getLocalProducts(organizationId, page = 1, limit = 10, filters = {}) {
        const p = parseInt(page) || 1;
        const l = parseInt(limit) || 10;
        const offset = (p - 1) * l;
        const where = { organization_id: organizationId };

        if (filters.search) {
            const searchVal = `%${filters.search}%`;
            where[Setting.sequelize.Op.or] = [
                { name: { [Setting.sequelize.Op.iLike]: searchVal } },
                { sku: { [Setting.sequelize.Op.iLike]: searchVal } },
                { code: { [Setting.sequelize.Op.iLike]: searchVal } },
                { barcode: { [Setting.sequelize.Op.iLike]: searchVal } },
                // Match variants as well
                Setting.sequelize.literal(`EXISTS (
                    SELECT 1 FROM product_variants 
                    WHERE product_variants.product_id = "Product".id 
                    AND (
                        product_variants.name ILIKE ${Setting.sequelize.escape(searchVal)} OR 
                        product_variants.sku ILIKE ${Setting.sequelize.escape(searchVal)} OR 
                        product_variants.barcode ILIKE ${Setting.sequelize.escape(searchVal)}
                    )
                )`)
            ];
        }

        // Find Branch ID for stock filtering
        const config = await this._getFullConfig(organizationId);
        let branchId = config?.pos_branch_id;
        if (!branchId) {
            const mainBranch = await Branch.findOne({
                where: { organization_id: organizationId, is_main: true },
                attributes: ['id']
            });
            branchId = mainBranch ? mainBranch.id : null;
        }

        logger.info(`Shopify Sync: Fetching local products for Org: ${organizationId}, Branch: ${branchId}`);

        const order = [];
        if (filters.sortField === 'stock') {
            // Sort by total aggregated stock for this branch
            order.push([
                Setting.sequelize.literal(`(
                    SELECT COALESCE(SUM(quantity), 0)
                    FROM stocks
                    WHERE product_id = "Product".id
                    AND branch_id = ${Setting.sequelize.escape(branchId)}
                    AND organization_id = ${Setting.sequelize.escape(organizationId)}
                )`),
                filters.sortOrder || 'DESC'
            ]);
        } else if (filters.sortField) {
            order.push([filters.sortField, filters.sortOrder || 'ASC']);
        } else {
            order.push(['created_at', 'DESC']);
        }

        const { count, rows } = await Product.findAndCountAll({
            where,
            include: [
                {
                    model: ProductVariant,
                    as: 'variants',
                    include: [{
                        model: Stock,
                        as: 'stocks',
                        where: {
                            organization_id: organizationId,
                            branch_id: branchId
                        },
                        required: false
                    }]
                }
            ],
            limit: l,
            offset: offset,
            order
        });

        return {
            total: count,
            data: rows,
            totalPages: Math.ceil(count / l)
        };
    }

    async updateShopifyProductStatus(organizationId, productId, status) {
        try {
            const config = await this._getFullConfig(organizationId);
            if (!config) throw new Error('Shopify not configured');

            const cleanShopUrl = config.shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '');
            const url = `https://${cleanShopUrl}/admin/api/2024-01/products/${productId}.json`;
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'X-Shopify-Access-Token': await tokenManager.getValidToken(organizationId),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    product: {
                        id: productId,
                        status: status
                    }
                }),
                signal: AbortSignal.timeout(15000)
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(`Shopify API Error: ${JSON.stringify(err.errors || 'Unknown error')}`);
            }

            return await response.json();
        } catch (error) {
            logger.error(`Update Shopify Product Status Error: ${error.message}`);
            throw error;
        }
    }

    async deleteShopifyProduct(organizationId, productId) {
        try {
            const config = await this._getFullConfig(organizationId);
            if (!config) throw new Error('Shopify not configured');

            const cleanShopUrl = config.shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '');
            const url = `https://${cleanShopUrl}/admin/api/2024-01/products/${productId}.json`;
            const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                    'X-Shopify-Access-Token': await tokenManager.getValidToken(organizationId)
                },
                signal: AbortSignal.timeout(15000)
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(`Shopify API Error: ${JSON.stringify(err.errors || 'Unknown error')}`);
            }

            return true;
        } catch (error) {
            logger.error(`Delete Shopify Product Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update sync status for multiple variants
     */
    async updateProductSyncStatus(organizationId, variantIds, enabled) {
        return await ProductVariant.update(
            { shopify_sync_enabled: enabled },
            {
                where: {
                    id: variantIds,
                    organization_id: organizationId
                }
            }
        );
    }

    /**
     * Push ALL local inventory to Shopify
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

            // Find Branch ID for stock filtering (Use config.pos_branch_id or fallback to main branch)
            let branchId = config.pos_branch_id;
            if (!branchId) {
                const mainBranch = await Branch.findOne({
                    where: { organization_id: organizationId, is_main: true },
                    attributes: ['id']
                });
                branchId = mainBranch ? mainBranch.id : null;
            }

            const variants = await ProductVariant.findAll({
                where: {
                    organization_id: organizationId,
                    shopify_sync_enabled: true
                },
                include: [
                    {
                        model: Setting.sequelize.models.Stock,
                        as: 'stocks',
                        where: {
                            organization_id: organizationId,
                            branch_id: branchId
                        },
                        required: false
                    },
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
                    await fetch(`https://${cleanShopUrl}/admin/api/2024-10/inventory_levels/set.json`, {
                        method: 'POST',
                        headers: {
                            'X-Shopify-Access-Token': access_token,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            location_id: location_id,
                            inventory_item_id: shopifyItem.id,
                            available: Math.max(0, Math.floor(totalStock))
                        }),
                        signal: AbortSignal.timeout(10000)
                    });

                    results.pushed++;
                } catch (err) {
                    logger.error(`Shopify Push Error (SKU: ${sku}): ${err.message}`);
                    results.failed++;
                }
            }

            return results;
        } catch (error) {
            logger.error(`Shopify Bulk Push Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get basic stats for the dashboard
     */
    async getAnalytics(organizationId) {
        try {
            const config = await this._getFullConfig(organizationId);
            if (!config) return null;

            const access_token = await tokenManager.getValidToken(organizationId);
            const cleanShopUrl = config.shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '');

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
     * Fetch products directly from Shopify Admin API
     */
    async getShopifyProducts(organizationId, search = '', pageInfo = '', limit = 50, filters = {}) {
        try {
            const config = await this._getFullConfig(organizationId);
            if (!config) throw new Error('Shopify not configured');

            const { shop_url } = config;
            const access_token = await tokenManager.getValidToken(organizationId);
            if (!access_token) throw new Error('No valid Shopify token available');

            const cleanShopUrl = shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '');

            let url = `https://${cleanShopUrl}/admin/api/2024-10/products.json?limit=${limit}`;

            if (pageInfo) {
                // If we have page_info, we must NOT include other filters like search/title
                url = `https://${cleanShopUrl}/admin/api/2024-10/products.json?limit=${limit}&page_info=${pageInfo}`;
            } else {
                if (search) url += `&title=${encodeURIComponent(search)}`;
                if (filters.status) url += `&status=${filters.status}`;
                if (filters.vendor) url += `&vendor=${encodeURIComponent(filters.vendor)}`;
            }

            const response = await fetch(url, {
                headers: { 'X-Shopify-Access-Token': access_token },
                signal: AbortSignal.timeout(15000)
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(`Shopify API Error: ${JSON.stringify(err.errors || 'Unknown error')}`);
            }

            // Robust Link header parsing
            const linkHeader = response.headers.get('Link');
            let next_page_info = null;
            let prev_page_info = null;

            if (linkHeader) {
                const links = linkHeader.split(',');
                links.forEach(link => {
                    const [urlPart, relPart] = link.split(';');
                    const url = urlPart.trim().replace(/<(.*)>/, '$1');
                    const rel = relPart.trim().replace(/rel="(.*)"/, '$1');

                    try {
                        const urlObj = new URL(url);
                        const info = urlObj.searchParams.get('page_info');
                        if (rel === 'next') next_page_info = info;
                        if (rel === 'previous') prev_page_info = info;
                    } catch (e) {
                        // Fallback if URL parsing fails
                        const match = url.match(/page_info=([^&]*)/);
                        if (match) {
                            if (rel === 'next') next_page_info = match[1];
                            if (rel === 'previous') prev_page_info = match[1];
                        }
                    }
                });
            }

            const data = await response.json();
            const shopifyProducts = data.products || [];

            // Fetch Inventory Levels for all variants to show real-time stock
            const inventoryItemIds = shopifyProducts.flatMap(p => p.variants.map(v => v.inventory_item_id)).filter(id => !!id);
            let inventoryMap = {};

            if (inventoryItemIds.length > 0) {
                try {
                    // Fetch in chunks of 50 (Shopify limit for inventory_item_ids parameter)
                    for (let i = 0; i < inventoryItemIds.length; i += 50) {
                        const chunk = inventoryItemIds.slice(i, i + 50);
                        const invUrl = `https://${cleanShopUrl}/admin/api/2024-10/inventory_levels.json?inventory_item_ids=${chunk.join(',')}`;
                        const invRes = await fetch(invUrl, {
                            headers: { 'X-Shopify-Access-Token': access_token },
                            signal: AbortSignal.timeout(10000)
                        });
                        if (invRes.ok) {
                            const invData = await invRes.json();
                            invData.inventory_levels?.forEach(level => {
                                if (!inventoryMap[level.inventory_item_id]) inventoryMap[level.inventory_item_id] = 0;
                                inventoryMap[level.inventory_item_id] += (level.available || 0);
                            });
                        }
                    }
                } catch (invErr) {
                    logger.error(`Shopify: Failed to fetch inventory levels: ${invErr.message}`);
                }
            }

            // Attach inventory to products
            shopifyProducts.forEach(p => {
                p.variants?.forEach(v => {
                    v.inventory_quantity = inventoryMap[v.inventory_item_id] || 0;
                });
            });

            // Cross-reference with local data
            const skus = shopifyProducts.flatMap(p => p.variants?.map(v => v.sku)).filter(Boolean);
            const localVariants = await ProductVariant.findAll({
                where: {
                    sku: skus,
                    organization_id: organizationId
                }
            });

            const skuMap = {};
            localVariants.forEach(v => { skuMap[v.sku] = v; });

            shopifyProducts.forEach(p => {
                p.local_match = p.variants?.some(v => skuMap[v.sku]) || false;
            });

            return {
                products: shopifyProducts,
                next_page_info,
                prev_page_info
            };
        } catch (error) {
            logger.error(`Get Shopify Products Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Fetch orders from Shopify Admin API
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

    /**
     * Fetch store details from Shopify Admin API
     */
    async getShopifyStoreDetails(organizationId) {
        try {
            const config = await this._getFullConfig(organizationId);
            if (!config) throw new Error('Shopify not configured');

            const { shop_url } = config;
            const access_token = await tokenManager.getValidToken(organizationId);
            if (!access_token) throw new Error('No valid Shopify token available');

            const cleanShopUrl = shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '');
            const response = await fetch(`https://${cleanShopUrl}/admin/api/2024-10/shop.json`, {
                headers: { 'X-Shopify-Access-Token': access_token },
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(`Shopify API Error: ${JSON.stringify(err.errors || 'Unknown error')}`);
            }

            const data = await response.json();
            return data.shop || null;
        } catch (error) {
            logger.error(`Get Shopify Store Details Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Smart Create: Check if SKU exists on Shopify first, if not create it
     */
    async createShopifyProduct(organizationId, variantId) {
        try {
            const config = await this._getFullConfig(organizationId);
            if (!config) throw new Error('Shopify not configured');

            const { shop_url } = config;
            const access_token = await tokenManager.getValidToken(organizationId);
            const cleanShopUrl = shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '');

            const variant = await ProductVariant.findByPk(variantId, {
                include: [{ model: Product, as: 'product' }]
            });

            if (!variant) throw new Error('Local variant not found');
            const sku = variant.sku || variant.barcode;
            if (!sku) throw new Error('Variant must have a SKU or Barcode to sync with Shopify');

            // 1. Check if SKU already exists on Shopify
            const checkResponse = await fetch(`https://${cleanShopUrl}/admin/api/2024-10/inventory_items.json?sku=${encodeURIComponent(sku)}`, {
                headers: { 'X-Shopify-Access-Token': access_token },
                signal: AbortSignal.timeout(10000)
            });
            const checkData = await checkResponse.json();

            if (checkData.inventory_items?.length > 0) {
                // SKU exists! Just enable local sync
                await variant.update({ shopify_sync_enabled: true });

                // Immediately push current local stock to the existing SKU
                const inventoryItemId = checkData.inventory_items[0].id;
                try {
                    const totalStock = await this._getLocalStockTotal(organizationId, variantId);
                    if (config.location_id) {
                        await fetch(`https://${cleanShopUrl}/admin/api/2024-10/inventory_levels/set.json`, {
                            method: 'POST',
                            headers: { 'X-Shopify-Access-Token': access_token, 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                location_id: config.location_id,
                                inventory_item_id: inventoryItemId,
                                available: Math.max(0, Math.floor(totalStock))
                            })
                        });
                    }
                } catch (stockErr) {
                    logger.error(`Shopify: Initial stock push failed for existing SKU: ${stockErr.message}`);
                }

                return {
                    action: 'linked',
                    message: 'Existing SKU found on Shopify. Product linked and stock synced successfully.',
                    shopify_id: inventoryItemId
                };
            }

            // 2. Create New Product on Shopify
            const shopifyPayload = {
                product: {
                    title: variant.product.name + (variant.name && variant.name !== 'Default' ? ` - ${variant.name}` : ''),
                    body_html: variant.product.description || 'Synced from Inzeedo POS',
                    vendor: 'Inzeedo POS',
                    product_type: 'POS Sync',
                    status: 'active',
                    variants: [
                        {
                            sku: sku,
                            price: variant.price,
                            inventory_management: 'shopify',
                            inventory_policy: 'deny'
                        }
                    ]
                }
            };

            const response = await fetch(`https://${cleanShopUrl}/admin/api/2024-10/products.json`, {
                method: 'POST',
                headers: {
                    'X-Shopify-Access-Token': access_token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(shopifyPayload),
                signal: AbortSignal.timeout(15000)
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(`Shopify API Error: ${JSON.stringify(err.errors || 'Unknown error')}`);
            }

            const data = await response.json();
            const createdVariant = data.product?.variants?.[0];

            if (createdVariant && createdVariant.inventory_item_id) {
                // 3. Immediately Push Current Local Stock to the new SKU
                try {
                    const totalStock = await this._getLocalStockTotal(organizationId, variantId);
                    if (config.location_id) {
                        await fetch(`https://${cleanShopUrl}/admin/api/2024-10/inventory_levels/set.json`, {
                            method: 'POST',
                            headers: { 'X-Shopify-Access-Token': access_token, 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                location_id: config.location_id,
                                inventory_item_id: createdVariant.inventory_item_id,
                                available: Math.max(0, Math.floor(totalStock))
                            })
                        });
                    }
                } catch (stockErr) {
                    logger.error(`Shopify: Initial stock push failed: ${stockErr.message}`);
                }
            }

            // Mark as enabled locally
            await variant.update({ shopify_sync_enabled: true });

            return {
                action: 'created',
                message: 'New product created on Shopify successfully.',
                product: data.product
            };
        } catch (error) {
            logger.error(`Create Shopify Product Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Bulk Create/Link: For each variantId, create on Shopify if not already there,
     * link if SKU exists, skip if no SKU. Enables sync for all.
     */
    async bulkCreateShopifyProducts(organizationId, variantIds) {
        const results = { total: variantIds.length, created: 0, linked: 0, skipped: 0, failed: 0, errors: [] };

        for (const variantId of variantIds) {
            try {
                const result = await this.createShopifyProduct(organizationId, variantId);
                if (result.action === 'created') results.created++;
                else if (result.action === 'linked') results.linked++;
            } catch (err) {
                logger.error(`Bulk Shopify Create - Variant ${variantId} failed: ${err.message}`);
                results.failed++;
                results.errors.push({ variantId, error: err.message });
            }
        }

        return results;
    }

    /**
     * Helper to get total local stock for a variant
     */
    async _getLocalStockTotal(organizationId, variantId) {
        try {
            const config = await this._getFullConfig(organizationId);

            // Find Branch ID for stock filtering
            let branchId = config?.pos_branch_id;
            if (!branchId) {
                const mainBranch = await Branch.findOne({
                    where: { organization_id: organizationId, is_main: true },
                    attributes: ['id']
                });
                branchId = mainBranch ? mainBranch.id : null;
            }

            const variant = await ProductVariant.findByPk(variantId, {
                include: [{
                    model: Setting.sequelize.models.Stock,
                    as: 'stocks',
                    where: {
                        organization_id: organizationId,
                        branch_id: branchId
                    },
                    required: false
                }]
            });
            if (!variant) return 0;
            return (variant.stocks || []).reduce((sum, s) => sum + parseFloat(s.quantity || 0), 0);
        } catch (error) {
            logger.error(`Error calculating local stock total: ${error.message}`);
            return 0;
        }
    }

    /**
     * Disconnect Shopify store and clear settings
     */
    async disconnect(organizationId) {
        try {
            await Setting.destroy({
                where: {
                    organization_id: organizationId,
                    category: 'shopify'
                }
            });

            // Also disable shopify_sync_enabled for all variants of this organization
            await ProductVariant.update(
                { shopify_sync_enabled: false },
                { where: { organization_id: organizationId } }
            );

            // Also disable shopify_sync_enabled for all products of this organization
            await Product.update(
                { shopify_sync_enabled: false },
                { where: { organization_id: organizationId } }
            );

            return { success: true, message: 'Shopify integration disconnected successfully' };
        } catch (error) {
            logger.error(`Disconnect Shopify Error: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new ShopifyService();
