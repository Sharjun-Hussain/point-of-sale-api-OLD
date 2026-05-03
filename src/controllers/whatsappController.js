const { Setting, Organization, Supplier, PurchaseOrder } = require('../models');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const ChatwootService = require('../services/chatwootService');
const { encrypt, decrypt, MASK } = require('../utils/security');
const logger = require('../utils/logger');

const parseSettingsData = (data) => {
    if (!data) return {};
    let parsed = data;
    if (typeof data === 'string') {
        try {
            parsed = JSON.parse(data);
        } catch (error) {
            logger.error('Failed to parse settings_data:', error);
            return {};
        }
    }

    // Recovery: If it's the corrupted "indexed character" object, discard it
    if (parsed && typeof parsed === 'object' && '0' in parsed) {
        logger.warn('Detected corrupted settings_data (indexed string), discarding...');
        return {};
    }

    return parsed || {};
};

const getSettings = async (req, res, next) => {
    try {
        if (!req.user.organization_id) {
            return errorResponse(res, 'Organization context missing', 400);
        }
        const setting = await Setting.findOne({
            where: {
                organization_id: req.user.organization_id,
                branch_id: null,
                category: 'whatsapp_crm'
            }
        });

        const org = await Organization.findByPk(req.user.organization_id, {
            attributes: ['whatsapp_enabled']
        });

        const settings = setting ? parseSettingsData(setting.settings_data) : {
            apiUrl: '',
            apiKey: '',
            accountId: '',
            inboxId: ''
        };

        // Mask the API Key for security
        if (settings.apiKey) settings.apiKey = MASK;

        return successResponse(res, {
            enabled: org.whatsapp_enabled,
            settings: settings
        }, 'WhatsApp CRM settings fetched');
    } catch (error) { next(error); }
};

const updateSettings = async (req, res, next) => {
    try {
        const { apiUrl, apiKey, accountId, inboxId, enabled } = req.body;

        logger.info('[WhatsApp Settings] User:', req.user.id, 'Org:', req.user.organization_id);

        if (!req.user.organization_id) {
            return errorResponse(res, 'Organization ID is required. Please ensure you are logged into an organization context.', 400);
        }

        // 1. Update Organization toggle
        await Organization.update(
            { whatsapp_enabled: !!enabled },
            { where: { id: req.user.organization_id } }
        );

        // 2. Prepare the settings data
        const finalSettingsData = { apiUrl, accountId, inboxId };
        
        // Find existing record to see if we need to preserve an existing apiKey
        let setting = await Setting.findOne({
            where: {
                organization_id: req.user.organization_id,
                branch_id: null,
                category: 'whatsapp_crm'
            }
        });

        // Handle API Key logic
        if (apiKey && apiKey !== MASK) {
            // New key provided, encrypt it
            finalSettingsData.apiKey = encrypt(apiKey);
        } else if (apiKey === MASK && setting) {
            // Mask provided, keep existing key
            const currentData = parseSettingsData(setting.settings_data);
            finalSettingsData.apiKey = currentData.apiKey;
        } else {
            // No key provided and no existing setting (or empty key provided)
            finalSettingsData.apiKey = '';
        }

        if (setting) {
            logger.info('[WhatsApp Settings] Updating existing record...');
            const currentData = parseSettingsData(setting.settings_data);
            const mergedData = { ...currentData, ...finalSettingsData };
            
            setting.setDataValue('settings_data', mergedData);
            setting.changed('settings_data', true);
            await setting.save();
        } else {
            logger.info('[WhatsApp Settings] Creating new record...');
            setting = await Setting.create({
                organization_id: req.user.organization_id,
                branch_id: null,
                category: 'whatsapp_crm',
                settings_data: finalSettingsData
            });
        }

        logger.info('[WhatsApp Settings] Final stored settings_data:', setting.settings_data);

        return successResponse(res, setting, 'WhatsApp CRM settings updated successfully');
    } catch (error) {
        logger.error('[WhatsApp Settings] FATAL ERROR:', error);
        next(error);
    }
};

const getTemplates = async (req, res, next) => {
    try {
        const setting = await Setting.findOne({
            where: {
                organization_id: req.user.organization_id,
                branch_id: null,
                category: 'whatsapp_crm'
            }
        });

        const config = parseSettingsData(setting.settings_data);

        if (!setting || !config.apiUrl) {
            return errorResponse(res, 'WhatsApp CRM is not configured', 400);
        }

        if (config.apiKey) config.apiKey = decrypt(config.apiKey);

        const chatwoot = new ChatwootService(config);
        const templates = await chatwoot.getTemplates();

        return successResponse(res, templates, 'Templates fetched successfully');
    } catch (error) { next(error); }
};

const sendPurchaseOrder = async (req, res, next) => {
    try {
        const { purchaseOrderId, templateName, customMessage } = req.body;

        const po = await PurchaseOrder.findByPk(purchaseOrderId, {
            include: [{ model: Supplier, as: 'supplier' }]
        });

        if (!po) return errorResponse(res, 'Purchase Order not found', 404);
        if (!po.supplier || !po.supplier.phone) {
            return errorResponse(res, 'Supplier does not have a valid phone number', 400);
        }

        const setting = await Setting.findOne({
            where: {
                organization_id: req.user.organization_id,
                branch_id: null,
                category: 'whatsapp_crm'
            }
        });

        const config = parseSettingsData(setting.settings_data);

        if (!setting || !config.apiUrl) {
            return errorResponse(res, 'WhatsApp CRM is not configured', 400);
        }

        if (config.apiKey) config.apiKey = decrypt(config.apiKey);

        const chatwoot = new ChatwootService(config);

        // 1. Find or create contact
        let contact = await chatwoot.searchContact(po.supplier.phone);
        if (!contact) {
            contact = await chatwoot.createContact({
                name: po.supplier.name,
                phone: po.supplier.phone,
                email: po.supplier.email,
                custom_attributes: {
                    supplier_id: po.supplier.id
                }
            });
        }

        // 2. Get or create conversation
        const conversation = await chatwoot.getOrCreateConversation(contact.id);

        // 3. Send message
        const poLink = `${process.env.FRONTEND_URL}/purchase/purchase-orders/${po.id}`; // Or PDF link
        const message = customMessage || `Hello ${po.supplier.name}, here is your Purchase Order ${po.po_number}: ${poLink}`;

        await chatwoot.sendMessage(conversation.id, message);

        return successResponse(res, null, 'Purchase Order sent via WhatsApp successfully');
    } catch (error) { next(error); }
};

module.exports = {
    getSettings,
    updateSettings,
    getTemplates,
    sendPurchaseOrder
};
