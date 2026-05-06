const shopifyService = require('../services/shopifyService');
const tokenManager = require('../services/shopifyTokenManager');
const { Setting, Organization } = require('../models');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { encrypt } = require('../utils/security');

const getConfig = async (req, res, next) => {
    try {
        const config = await shopifyService.getConfig(req.user.organization_id);
        return successResponse(res, config || {}, 'Shopify configuration fetched');
    } catch (error) { next(error); }
};

const saveConfig = async (req, res, next) => {
    try {
        const organization = await Organization.findByPk(req.user.organization_id);
        if (!organization?.shopify_enabled) {
            return errorResponse(res, 'Shopify integration is not enabled for this organization. Please contact your Super Admin.', 403);
        }

        const { shop_url, access_token, client_id, client_secret, location_id, enabled } = req.body;

        // Verify connection before saving
        const verification = await shopifyService.verifyConnection({ shop_url, access_token });
        if (!verification.success) {
            return errorResponse(res, `Connection Failed: ${verification.message}`, 400);
        }

        const settingsData = { 
            shop_url, 
            access_token: encrypt(access_token), 
            location_id, 
            enabled 
        };

        // Store OAuth credentials if provided (needed for 24h token auto-refresh)
        if (client_id) settingsData.client_id = client_id;
        if (client_secret) settingsData.client_secret = encrypt(client_secret);
        settingsData.token_saved_at = new Date().toISOString();

        const [setting, created] = await Setting.findOrCreate({
            where: {
                organization_id: req.user.organization_id,
                category: 'shopify',
                branch_id: null // Shopify settings are organization-wide
            },
            defaults: { settings_data: settingsData }
        });
        
        if (!created) {
            // Ensure we have a clean object from the DB
            let currentData = typeof setting.settings_data === 'string' 
                ? JSON.parse(setting.settings_data) 
                : setting.get('settings_data') || {};

            // Defensive cleanup: Remove any numeric keys (remnants of previous string-spread corruption)
            if (currentData && typeof currentData === 'object') {
                Object.keys(currentData).forEach(key => {
                    if (!isNaN(key)) delete currentData[key];
                });
            }

            // Merge new settings with existing ones
            const updatedSettings = {
                ...currentData,
                ...settingsData
            };
            
            await setting.update({ settings_data: updatedSettings });
        }

        // Seed the in-memory token cache immediately so first requests don't wait
        tokenManager.cacheToken(req.user.organization_id, access_token);

        return successResponse(res, { ...settingsData, client_secret: undefined }, 'Shopify configuration saved successfully');
    } catch (error) { next(error); }
};

const testConnection = async (req, res, next) => {
    try {
        const verification = await shopifyService.verifyConnection(req.body);
        if (verification.success) {
            // Seed the cache with this validated token
            if (req.body.access_token && req.user?.organization_id) {
                tokenManager.cacheToken(req.user.organization_id, req.body.access_token);
            }
            return successResponse(res, verification.shop, 'Shopify connection verified');
        } else {
            return errorResponse(res, verification.message, 400);
        }
    } catch (error) { next(error); }
};

const pushInventory = async (req, res, next) => {
    try {
        const results = await shopifyService.pushAllInventory(req.user.organization_id);
        return successResponse(res, results, 'Inventory push completed');
    } catch (error) { next(error); }
};

// Pulling is currently disabled by request
const pullProducts = async (req, res, next) => {
    return errorResponse(res, 'Pulling products from Shopify is currently disabled', 403);
};

const getLocalProducts = async (req, res, next) => {
    try {
        const products = await shopifyService.getLocalProducts(req.user.organization_id);
        return successResponse(res, products, 'Local products fetched');
    } catch (error) { next(error); }
};

const updateProductSync = async (req, res, next) => {
    try {
        const { product_ids, enabled } = req.body;
        await shopifyService.updateProductSyncStatus(req.user.organization_id, product_ids, enabled);
        return successResponse(res, null, 'Product sync status updated');
    } catch (error) { next(error); }
};

const getAnalytics = async (req, res, next) => {
    try {
        const stats = await shopifyService.getAnalytics(req.user.organization_id);
        return successResponse(res, stats, 'Shopify analytics fetched');
    } catch (error) { next(error); }
};

const getShopifyProducts = async (req, res, next) => {
    try {
        const products = await shopifyService.getShopifyProducts(req.user.organization_id);
        return successResponse(res, products, 'Shopify products fetched');
    } catch (error) { next(error); }
};

const getShopifyOrders = async (req, res, next) => {
    try {
        const orders = await shopifyService.getShopifyOrders(req.user.organization_id);
        return successResponse(res, orders, 'Shopify orders fetched');
    } catch (error) { next(error); }
};

module.exports = {
    getConfig,
    saveConfig,
    testConnection,
    pushInventory,
    pullProducts,
    getAnalytics,
    getShopifyProducts,
    getShopifyOrders,
    getLocalProducts,
    updateProductSync
};
