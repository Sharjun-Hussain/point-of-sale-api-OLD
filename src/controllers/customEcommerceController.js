const customEcommerceService = require('../services/customEcommerceService');
const { Setting, Organization, Product, ProductVariant, Stock } = require('../models');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { encrypt, decrypt } = require('../utils/security');
const crypto = require('crypto');

/**
 * Fetch Custom E-commerce Configuration
 */
const getConfig = async (req, res, next) => {
    try {
        const organizationId = req.user.organization_id;
        const setting = await Setting.findOne({
            where: {
                organization_id: organizationId,
                category: 'custom_ecommerce',
                branch_id: null
            }
        });

        let data = {};
        if (setting && setting.settings_data) {
            data = typeof setting.settings_data === 'string'
                ? JSON.parse(setting.settings_data)
                : setting.settings_data;

            // Decrypt outbound API token
            if (data.api_token) {
                data.api_token = decrypt(data.api_token);
            }
        }

        // Return current config
        return successResponse(res, {
            enabled: data.enabled || false,
            api_url: data.api_url || '',
            api_token: data.api_token || '',
            inbound_token: data.inbound_token || '',
            pos_branch_id: data.pos_branch_id || null
        }, 'Custom e-commerce configuration fetched');
    } catch (error) {
        next(error);
    }
};

/**
 * Save Custom E-commerce Configuration
 */
const saveConfig = async (req, res, next) => {
    try {
        const organization = await Organization.findByPk(req.user.organization_id);
        if (!organization?.custom_ecommerce_enabled) {
            return errorResponse(res, 'Custom E-commerce integration is not enabled for this organization. Please contact support.', 403);
        }

        const { api_url, api_token, pos_branch_id, enabled } = req.body;

        const [setting, created] = await Setting.findOrCreate({
            where: {
                organization_id: req.user.organization_id,
                category: 'custom_ecommerce',
                branch_id: null
            },
            defaults: {
                settings_data: {
                    enabled: enabled || false,
                    api_url: api_url || '',
                    api_token: api_token ? encrypt(api_token) : '',
                    inbound_token: `pos_inbound_${crypto.randomBytes(24).toString('hex')}`,
                    pos_branch_id: pos_branch_id || null
                }
            }
        });

        if (!created) {
            let currentData = typeof setting.settings_data === 'string'
                ? JSON.parse(setting.settings_data)
                : setting.get('settings_data') || {};

            // Cleanup potential spread artifacts
            if (currentData && typeof currentData === 'object') {
                Object.keys(currentData).forEach(key => {
                    if (!isNaN(key)) delete currentData[key];
                });
            }

            const updatedSettings = {
                ...currentData,
                enabled: enabled !== undefined ? enabled : currentData.enabled,
                api_url: api_url !== undefined ? api_url : currentData.api_url,
                api_token: api_token ? encrypt(api_token) : currentData.api_token,
                pos_branch_id: pos_branch_id !== undefined ? pos_branch_id : currentData.pos_branch_id
            };

            // Generate inbound token if missing
            if (!updatedSettings.inbound_token) {
                updatedSettings.inbound_token = `pos_inbound_${crypto.randomBytes(24).toString('hex')}`;
            }

            setting.set('settings_data', updatedSettings);
            setting.changed('settings_data', true);
            await setting.save();
        }

        return successResponse(res, null, 'Custom e-commerce configuration saved successfully');
    } catch (error) {
        next(error);
    }
};

/**
 * Generate a New Inbound Token
 */
const generateInboundToken = async (req, res, next) => {
    try {
        const setting = await Setting.findOne({
            where: {
                organization_id: req.user.organization_id,
                category: 'custom_ecommerce',
                branch_id: null
            }
        });

        if (!setting) {
            return errorResponse(res, 'Custom E-commerce is not initialized. Save settings first.', 400);
        }

        let currentData = typeof setting.settings_data === 'string'
            ? JSON.parse(setting.settings_data)
            : setting.get('settings_data') || {};

        const newToken = `pos_inbound_${crypto.randomBytes(24).toString('hex')}`;
        currentData.inbound_token = newToken;

        await setting.update({ settings_data: currentData });

        return successResponse(res, { inbound_token: newToken }, 'New inbound API token generated successfully');
    } catch (error) {
        next(error);
    }
};

/**
 * Verify Connection (Ping outbound Client API)
 */
const testConnection = async (req, res, next) => {
    try {
        const { api_url, api_token } = req.body;
        if (!api_url) {
            return errorResponse(res, 'API Webhook URL is required.', 400);
        }

        const response = await fetch(`${api_url.replace(/\/$/, '')}/api/webhooks/pos-inventory-sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${api_token}`
            },
            body: JSON.stringify({
                ping: true,
                timestamp: new Date().toISOString()
            }),
            signal: AbortSignal.timeout(6000)
        });

        if (response.ok) {
            return successResponse(res, null, 'Custom e-commerce endpoint verified successfully!');
        } else {
            return errorResponse(res, `Endpoint returned HTTP Status: ${response.status}`, 400);
        }
    } catch (error) {
        return errorResponse(res, `Failed to connect: ${error.message}`, 400);
    }
};

/**
 * Trigger Bulk Inventory Push
 */
const pushInventory = async (req, res, next) => {
    try {
        const syncResult = await customEcommerceService.pushAllInventory(req.user.organization_id);
        if (syncResult.success) {
            return successResponse(res, syncResult.results, 'Bulk inventory sync executed successfully');
        } else {
            return errorResponse(res, syncResult.error, 500);
        }
    } catch (error) {
        next(error);
    }
};

/**
 * Get Local Products List with Sync Flags & Quantities
 */
const getLocalProducts = async (req, res, next) => {
    try {
        const organizationId = req.user.organization_id;
        const { page = 1, size = 50, name } = req.query;
        const limit = parseInt(size);
        const offset = (parseInt(page) - 1) * limit;

        // Find branch mapping to fetch exact stock
        const setting = await Setting.findOne({
            where: { organization_id: organizationId, category: 'custom_ecommerce' }
        });
        const config = setting ? setting.settings_data : {};
        let branchId = config.pos_branch_id;

        if (!branchId) {
            const mainBranch = await Branch.findOne({
                where: { organization_id: organizationId, is_main: true }
            });
            branchId = mainBranch ? mainBranch.id : null;
        }

        const productWhere = { organization_id: organizationId };
        if (name) {
            productWhere.name = { [Sequelize.Op.like]: `%${name}%` };
        }

        const { count, rows } = await Product.findAndCountAll({
            where: productWhere,
            limit,
            offset,
            include: [
                {
                    model: ProductVariant,
                    as: 'variants',
                    include: [
                        {
                            model: Stock,
                            as: 'stocks',
                            where: branchId ? { branch_id: branchId } : {},
                            required: false
                        }
                    ]
                }
            ],
            distinct: true,
            order: [['name', 'ASC']]
        });

        const formattedProducts = rows.map(prod => {
            let totalQty = 0;
            prod.variants?.forEach(v => {
                v.stocks?.forEach(s => {
                    totalQty += parseFloat(s.quantity || 0);
                });
            });

            return {
                id: prod.id,
                name: prod.name,
                code: prod.code,
                barcode: prod.barcode,
                price: prod.price,
                custom_ecommerce_sync_enabled: prod.custom_ecommerce_sync_enabled,
                available_stock: totalQty
            };
        });

        return successResponse(res, {
            products: formattedProducts,
            total: count,
            page: parseInt(page),
            limit
        }, 'Local products fetched successfully');
    } catch (error) {
        next(error);
    }
};

/**
 * Batch Update Product Sync Flags
 */
const updateProductSync = async (req, res, next) => {
    try {
        const organizationId = req.user.organization_id;
        const { product_ids, enabled } = req.body;

        if (!Array.isArray(product_ids) || product_ids.length === 0) {
            return errorResponse(res, 'Product IDs array is required', 400);
        }

        await Product.update(
            { custom_ecommerce_sync_enabled: enabled },
            {
                where: {
                    id: product_ids,
                    organization_id: organizationId
                }
            }
        );

        return successResponse(res, null, `Product e-commerce sync settings updated successfully.`);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getConfig,
    saveConfig,
    generateInboundToken,
    testConnection,
    pushInventory,
    getLocalProducts,
    updateProductSync
};
