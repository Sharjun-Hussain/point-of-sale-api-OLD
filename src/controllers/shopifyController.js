const shopifyService = require('../services/shopifyService');
const { Setting, Organization } = require('../models');
const { successResponse, errorResponse } = require('../utils/responseHandler');

const getConfig = async (req, res, next) => {
    try {
        const config = await shopifyService.getConfig(req.user.organization_id);
        return successResponse(res, config || {}, 'Shopify configuration fetched');
    } catch (error) { next(error); }
};

const saveConfig = async (req, res, next) => {
    try {
        const { shop_url, access_token, location_id, enabled } = req.body;

        // Verify connection before saving
        const verification = await shopifyService.verifyConnection({ shop_url, access_token });
        if (!verification.success) {
            return errorResponse(res, `Connection Failed: ${verification.message}`, 400);
        }

        const [setting, created] = await Setting.findOrCreate({
            where: {
                organization_id: req.user.organization_id,
                category: 'shopify'
            },
            defaults: {
                settings_data: { shop_url, access_token, location_id, enabled }
            }
        });

        if (!created) {
            await setting.update({
                settings_data: { shop_url, access_token, location_id, enabled }
            });
        }

        return successResponse(res, setting.settings_data, 'Shopify configuration saved successfully');
    } catch (error) { next(error); }
};

const testConnection = async (req, res, next) => {
    try {
        const verification = await shopifyService.verifyConnection(req.body);
        if (verification.success) {
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

module.exports = {
    getConfig,
    saveConfig,
    testConnection,
    pushInventory,
    pullProducts,
    getAnalytics,
    getLocalProducts,
    updateProductSync
};
