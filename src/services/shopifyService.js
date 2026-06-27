const { Setting, Product, ProductVariant, Organization, Branch, Stock, Brand, AttributeValue, Attribute, SubCategory } = require('../models');
const logger = require('../utils/logger');
const tokenManager = require('./shopifyTokenManager');
const { decrypt } = require('../utils/security');
const { Op } = require('sequelize');

class ShopifyService {
    /**
     * Get Shopify configuration for an organization
     */
    async getConfig(organizationId) {
        const config = await this._getFullConfig(organizationId);
        if (!config) return null;

        // Get a guaranteed valid token (auto-refreshes if needed)
        const validToken = await tokenManager.getValidToken(organizationId);

        let verification = { success: false, shop: null };
        if (validToken) {
            // Verify if the active token actually works
            verification = await this.verifyConnection({
                shop_url: config.shop_url,
                access_token: validToken
            });
        }

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
     * Get detailed information for a specific Shopify product
     */
    async getShopifyProductDetails(organizationId, shopifyProductId) {
        try {
            const config = await this._getFullConfig(organizationId);
            if (!config) throw new Error('Shopify is not configured for this organization');

            const access_token = await tokenManager.getValidToken(organizationId);
            const cleanShopUrl = config.shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '');

            const response = await fetch(`https://${cleanShopUrl}/admin/api/2024-10/products/${shopifyProductId}.json`, {
                headers: { 'X-Shopify-Access-Token': access_token },
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.errors || `Failed to fetch product ${shopifyProductId} from Shopify`);
            }

            const data = await response.json();
            return data.product;
        } catch (error) {
            logger.error(`Shopify Product Details Error: ${error.message}`);
            throw error;
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
        const isShowAll = limit === 'all' || limit === -1 || limit === '-1';
        const l = isShowAll ? null : (parseInt(limit) || 10);
        const offset = isShowAll ? null : ((p - 1) * l);
        const where = { organization_id: organizationId };

        if (filters.search) {
            const searchVal = `%${filters.search}%`;
            where[Op.or] = [
                { name: { [Op.iLike]: searchVal } },
                { sku: { [Op.iLike]: searchVal } },
                { code: { [Op.iLike]: searchVal } },
                { barcode: { [Op.iLike]: searchVal } },
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

        const queryOptions = {
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
            order
        };

        if (!isShowAll) {
            queryOptions.limit = l;
            queryOptions.offset = offset;
        }

        const { count, rows } = await Product.findAndCountAll(queryOptions);

        return {
            total: count,
            data: rows,
            totalPages: isShowAll ? 1 : Math.ceil(count / l)
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

    async deleteShopifyProduct(organizationId, productId, localProductId = null) {
        try {
            const config = await this._getFullConfig(organizationId);
            if (!config) throw new Error('Shopify not configured');

            const access_token = await tokenManager.getValidToken(organizationId);
            const cleanShopUrl = config.shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '');

            // Delete from Shopify
            const url = `https://${cleanShopUrl}/admin/api/2024-01/products/${productId}.json`;
            const response = await fetch(url, {
                method: 'DELETE',
                headers: { 'X-Shopify-Access-Token': access_token },
                signal: AbortSignal.timeout(15000)
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(`Shopify API Error: ${JSON.stringify(err.errors || 'Unknown error')}`);
            }

            // Unlink the matched local product and its variants
            if (localProductId) {
                await Product.update(
                    { shopify_sync_enabled: false },
                    { where: { id: localProductId, organization_id: organizationId } }
                );
                await ProductVariant.update(
                    { shopify_sync_enabled: false },
                    { where: { product_id: localProductId, organization_id: organizationId } }
                );
                logger.info(`Delete: Unlinked local product ID ${localProductId} and its variants`);
            }

            return true;
        } catch (error) {
            logger.error(`Delete Shopify Product Error: ${error.message}`);
            throw error;
        }
    }


    /**
     * Update sync status for multiple products and their variants
     */
    async updateProductSyncStatus(organizationId, productIds, enabled) {
        await Product.update(
            { shopify_sync_enabled: enabled },
            {
                where: {
                    id: productIds,
                    organization_id: organizationId
                }
            }
        );
        return await ProductVariant.update(
            { shopify_sync_enabled: enabled },
            {
                where: {
                    product_id: productIds,
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
                        model: Stock,
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
                // Find the first Shopify variant that has a matching local variant by SKU
                // Return the actual local variant object (not just boolean) so callers can access .id, .shopify_sync_enabled, etc.
                let matched = null;
                for (const v of (p.variants || [])) {
                    if (v.sku && skuMap[v.sku]) {
                        matched = skuMap[v.sku];
                        break;
                    }
                }
                p.local_match = matched || false;
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
     * Create Product on Shopify using the GraphQL productSet mutation.
     * Per Shopify docs: https://shopify.dev/docs/api/admin-graphql/latest/mutations/productSet
     * This is the recommended approach for syncing products from an external source (POS).
     */
    async createShopifyProduct(organizationId, productId) {
        try {
            const config = await this._getFullConfig(organizationId);
            if (!config) throw new Error('Shopify not configured');

            const { shop_url } = config;
            const access_token = await tokenManager.getValidToken(organizationId);
            const cleanShopUrl = shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '');

            const product = await Product.findByPk(productId, {
                include: [
                    { model: Brand, as: 'brand' },
                    { model: SubCategory, as: 'sub_category' },
                    {
                        model: ProductVariant,
                        as: 'variants',
                        where: { is_active: true, organization_id: organizationId },
                        required: false,
                        include: [{
                            model: AttributeValue,
                            as: 'attribute_values',
                            include: [{ model: Attribute, as: 'attribute' }]
                        }]
                    }
                ]
            });

            if (!product) throw new Error('Local product not found');
            const variants = product.variants || [];
            if (variants.length === 0) throw new Error('Product must have at least one variant to sync with Shopify');

            // ─── 1. Build productOptions and variants for GraphQL productSet ───
            // New Shopify product model: productOptions[].values[] + variants[].optionValues[]
            // Ref: https://shopify.dev/docs/api/admin-graphql/latest/mutations/productSet

            const optionsMap = new Map(); // optionName → Set<value>
            const shopifyVariants = [];

            for (const v of variants) {
                const sku = v.sku || v.barcode || product.code;
                if (!sku) throw new Error(`Variant "${v.name}" is missing a SKU or Barcode`);

                const variantOptionValues = [];

                if (v.attribute_values && v.attribute_values.length > 0) {
                    // Use real attribute names/values (e.g. Color=Red, Size=M)
                    v.attribute_values.slice(0, 3).forEach((av) => {
                        const optionName = av.attribute?.name || 'Option';
                        const optionValue = av.value;
                        if (!optionsMap.has(optionName)) optionsMap.set(optionName, new Set());
                        optionsMap.get(optionName).add(optionValue);
                        variantOptionValues.push({ optionName, name: optionValue });
                    });
                } else {
                    // Fallback: no attribute_values on this variant
                    if (variants.length === 1) {
                        // ── Single-variant (direct) product ──
                        // Use Shopify's magic "Title"/"Default Title" pair.
                        // Shopify storefront automatically HIDES this option selector,
                        // so the product page shows NO clickable option buttons.
                        const optionName = 'Title';
                        const optionValue = 'Default Title';
                        if (!optionsMap.has(optionName)) optionsMap.set(optionName, new Set());
                        optionsMap.get(optionName).add(optionValue);
                        variantOptionValues.push({ optionName, name: optionValue });
                    } else {
                        // ── Multi-variant product without attributes ──
                        // Use "Style" as the option name so each variant name shows
                        // as a visible, clickable button on the Shopify storefront.
                        const fallbackOptionName = 'Style';
                        let optionValue = v.name && v.name !== 'Default' ? v.name : `Variant ${sku}`;
                        // Ensure uniqueness across variants
                        const isDuplicate = shopifyVariants.some(sv =>
                            sv._optionValues?.some(ov => ov.name === optionValue && ov.optionName === fallbackOptionName)
                        );
                        if (isDuplicate) optionValue = `${optionValue} (${sku})`;
                        if (!optionsMap.has(fallbackOptionName)) optionsMap.set(fallbackOptionName, new Set());
                        optionsMap.get(fallbackOptionName).add(optionValue);
                        variantOptionValues.push({ optionName: fallbackOptionName, name: optionValue });
                    }
                }

                // NOTE: unitCost is NOT valid in InventoryItemInput for productSet.
                // It must be set via inventoryItemUpdate after product creation.
                const costPrice = parseFloat(v.cost_price || 0);

                shopifyVariants.push({
                    _optionValues: variantOptionValues, // internal, stripped before send
                    _costPrice: costPrice,              // internal, used post-creation
                    optionValues: variantOptionValues,
                    sku,
                    price: String(parseFloat(v.price || 0).toFixed(2)),
                    taxable: false,                    // ← Unticks "Charge tax on this product"
                    inventoryItem: {
                        tracked: false,
                        requiresShipping: false        // ← No shipping setup needed
                    },
                    inventoryPolicy: 'DENY'
                });
            }

            // Build productOptions array
            const productOptions = Array.from(optionsMap.entries()).map(([name, valuesSet], idx) => ({
                name,
                position: idx + 1,
                values: Array.from(valuesSet).map(val => ({ name: val }))
            }));
            if (productOptions.length === 0) {
                productOptions.push({ name: 'Title', position: 1, values: [{ name: 'Default Title' }] });
            }

            // Strip internal keys before sending to API
            const cleanVariants = shopifyVariants.map(({ _optionValues, _costPrice, ...rest }) => rest);

            // Build a costPrice lookup map: sku → costPrice (for post-creation unitCost update)
            const costPriceBySku = {};
            shopifyVariants.forEach(sv => { if (sv._costPrice > 0) costPriceBySku[sv.sku] = sv._costPrice; });

            // ─── 2. Execute GraphQL productSet mutation ───
            const graphqlQuery = `
                mutation productSet($input: ProductSetInput!, $synchronous: Boolean!) {
                    productSet(synchronous: $synchronous, input: $input) {
                        product {
                            id
                            title
                            handle
                            variants(first: 100) {
                                nodes {
                                    id
                                    sku
                                    inventoryItem {
                                        id
                                    }
                                }
                            }
                        }
                        userErrors {
                            field
                            message
                            code
                        }
                    }
                }
            `;

            // Map POS sub-category → Shopify productType (priority: sub_category > product_type > fallback)
            const shopifyProductType = product.sub_category?.name
                || product.product_type
                || 'POS Sync';

            const graphqlVariables = {
                synchronous: true,
                input: {
                    title: product.name,
                    descriptionHtml: product.description || 'Synced from Inzeedo POS',
                    vendor: product.brand?.name || 'Inzeedo POS',
                    productType: shopifyProductType,
                    status: 'ACTIVE',
                    productOptions,
                    variants: cleanVariants
                }
            };

            logger.info(`Shopify productSet: "${product.name}" → productType = "${shopifyProductType}" (sub_category: "${product.sub_category?.name || 'none'}")`);

            const graphqlUrl = `https://${cleanShopUrl}/admin/api/2024-10/graphql.json`;
            const response = await fetch(graphqlUrl, {
                method: 'POST',
                headers: {
                    'X-Shopify-Access-Token': access_token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: graphqlQuery, variables: graphqlVariables }),
                signal: AbortSignal.timeout(30000)
            });

            if (!response.ok) {
                const errText = await response.text().catch(() => 'Unknown HTTP error');
                throw new Error(`Shopify GraphQL HTTP ${response.status}: ${errText}`);
            }

            const result = await response.json();

            // Surface GraphQL protocol-level errors
            if (result.errors?.length > 0) {
                throw new Error(`Shopify GraphQL Error: ${result.errors.map(e => e.message).join(', ')}`);
            }

            const userErrors = result?.data?.productSet?.userErrors || [];
            if (userErrors.length > 0) {
                const msg = userErrors.map(e => `[${(e.field || []).join('.')}] ${e.message}`).join('; ');
                throw new Error(`Shopify productSet failed: ${msg}`);
            }

            const createdShopifyProduct = result?.data?.productSet?.product;
            if (!createdShopifyProduct) {
                throw new Error('Shopify productSet returned no product. Verify your access scopes and input.');
            }

            // ─── 3. Push stock + set cost per item for each created Shopify variant ───
            if (createdShopifyProduct.variants?.nodes && config.location_id) {
                for (const createdVariant of createdShopifyProduct.variants.nodes) {
                    const inventoryGid = createdVariant.inventoryItem?.id;
                    if (!inventoryGid) continue;

                    // GID format: "gid://shopify/InventoryItem/12345" — extract numeric ID
                    const numericInventoryItemId = inventoryGid.split('/').pop();
                    const localV = variants.find(v => (v.sku || v.barcode || product.code) === createdVariant.sku);
                    if (!localV) continue;

                    // 3a. Set inventory stock level
                    try {
                        const totalStock = await this._getLocalStockTotal(organizationId, localV.id);
                        await fetch(`https://${cleanShopUrl}/admin/api/2024-10/inventory_levels/set.json`, {
                            method: 'POST',
                            headers: { 'X-Shopify-Access-Token': access_token, 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                location_id: config.location_id,
                                inventory_item_id: numericInventoryItemId,
                                available: Math.max(0, Math.floor(totalStock))
                            }),
                            signal: AbortSignal.timeout(10000)
                        });
                        logger.info(`Shopify: Set stock for SKU "${createdVariant.sku}" → qty ${totalStock}`);
                    } catch (stockErr) {
                        logger.error(`Shopify: Stock push failed for SKU "${createdVariant.sku}": ${stockErr.message}`);
                    }

                    // 3b. Set cost per item (unitCost) via inventoryItemUpdate — separate call required
                    const costPrice = costPriceBySku[createdVariant.sku];
                    if (costPrice > 0) {
                        try {
                            const costMutation = `
                                mutation inventoryItemUpdate($id: ID!, $input: InventoryItemUpdateInput!) {
                                    inventoryItemUpdate(id: $id, input: $input) {
                                        inventoryItem { id unitCost { amount currencyCode } }
                                        userErrors { field message }
                                    }
                                }
                            `;
                            const costRes = await fetch(graphqlUrl, {
                                method: 'POST',
                                headers: { 'X-Shopify-Access-Token': access_token, 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    query: costMutation,
                                    variables: {
                                        id: inventoryGid,
                                        input: {
                                            cost: String(costPrice.toFixed(2))
                                        }
                                    }
                                }),
                                signal: AbortSignal.timeout(10000)
                            });
                            const costResult = await costRes.json();
                            const costErrors = costResult?.data?.inventoryItemUpdate?.userErrors || [];
                            if (costErrors.length > 0) {
                                logger.error(`Shopify: unitCost update failed for SKU "${createdVariant.sku}": ${costErrors.map(e => e.message).join(', ')}`);
                            } else {
                                logger.info(`Shopify: Set unitCost for SKU "${createdVariant.sku}" → LKR ${costPrice.toFixed(2)}`);
                            }
                        } catch (costErr) {
                            logger.error(`Shopify: unitCost push failed for SKU "${createdVariant.sku}": ${costErr.message}`);
                        }
                    }
                }
            }

            // ─── 4. Mark product and variants as sync-enabled locally ───
            await product.update({ shopify_sync_enabled: true });
            await ProductVariant.update(
                { shopify_sync_enabled: true },
                { where: { product_id: product.id, organization_id: organizationId } }
            );

            logger.info(`Shopify productSet: Created "${product.name}" → GID ${createdShopifyProduct.id}`);

            return {
                action: 'created',
                message: 'Product synced to Shopify successfully via GraphQL productSet.',
                product: createdShopifyProduct
            };
        } catch (error) {
            logger.error(`Create Shopify Product Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Bulk Create/Link: For each productId, create on Shopify
     */
    async bulkCreateShopifyProducts(organizationId, productIds) {
        const results = { total: productIds.length, created: 0, linked: 0, skipped: 0, failed: 0, errors: [] };

        for (const productId of productIds) {
            try {
                const result = await this.createShopifyProduct(organizationId, productId);
                if (result.action === 'created') results.created++;
                else if (result.action === 'linked') results.linked++;
            } catch (err) {
                logger.error(`Bulk Shopify Create - Product ${productId} failed: ${err.message}`);
                results.failed++;
                results.errors.push({ productId, error: err.message });
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
                    model: Stock,
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
     * Bulk Delete: Remove multiple products from Shopify by their Shopify product IDs.
     * variantIds: optional array of local ProductVariant IDs to unlink after successful deletions.
     */
    async bulkDeleteShopifyProducts(organizationId, productIds, localProductIds = []) {
        const config = await this._getFullConfig(organizationId);
        if (!config) throw new Error('Shopify not configured');

        const cleanShopUrl = config.shop_url.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const access_token = await tokenManager.getValidToken(organizationId);
        if (!access_token) throw new Error('No valid Shopify token available');

        const results = { total: productIds.length, deleted: 0, failed: 0, errors: [] };

        for (const productId of productIds) {
            try {
                const url = `https://${cleanShopUrl}/admin/api/2024-01/products/${productId}.json`;
                const response = await fetch(url, {
                    method: 'DELETE',
                    headers: { 'X-Shopify-Access-Token': access_token },
                    signal: AbortSignal.timeout(15000)
                });

                if (!response.ok) {
                    const err = await response.json().catch(() => ({}));
                    throw new Error(`Shopify API Error: ${JSON.stringify(err.errors || 'Unknown error')}`);
                }

                results.deleted++;
            } catch (err) {
                logger.error(`Bulk Delete - Product ${productId} failed: ${err.message}`);
                results.failed++;
                results.errors.push({ productId, error: err.message });
            }
        }

        // Unlink local products by ID
        if (localProductIds.length > 0) {
            try {
                await Product.update(
                    { shopify_sync_enabled: false },
                    { where: { id: localProductIds, organization_id: organizationId } }
                );
                const [unlinkedCount] = await ProductVariant.update(
                    { shopify_sync_enabled: false },
                    { where: { product_id: localProductIds, organization_id: organizationId } }
                );
                logger.info(`Bulk Delete: Unlinked ${unlinkedCount} local variant(s) and their parent products by ID`);
            } catch (unlinkErr) {
                logger.error(`Bulk Delete: Failed to unlink local products/variants: ${unlinkErr.message}`);
            }
        }

        return results;
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
