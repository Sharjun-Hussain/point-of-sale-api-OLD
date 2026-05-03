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

module.exports = {
    getConfig,
    saveConfig,
    testConnection
};
