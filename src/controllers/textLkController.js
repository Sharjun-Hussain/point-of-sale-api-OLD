const textLkService = require('../services/textLkService');
const googleDriveService = require('../services/googleDriveService');
const { Setting, Organization, Customer, TextLkTemplate, TextLkCampaign } = require('../models');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { encrypt, isMasked, MASK } = require('../utils/security');
const logger = require('../utils/logger');

const getConfig = async (req, res, next) => {
    try {
        const setting = await Setting.findOne({
            where: {
                organization_id: req.user.organization_id,
                category: 'textlk_crm',
                branch_id: null
            }
        });

        const org = await Organization.findByPk(req.user.organization_id, {
            attributes: ['textlk_enabled']
        });

        let config = setting ? setting.settings_data : {};
        if (typeof config === 'string') config = JSON.parse(config);

        // Mask API Key
        if (config.apiKey) config.apiKey = MASK;

        return successResponse(res, {
            enabled: org?.textlk_enabled || false,
            config: config,
            googleDriveConnected: !!config.googleDriveRefreshToken
        }, 'Text.lk configuration fetched');
    } catch (error) { next(error); }
};

const saveConfig = async (req, res, next) => {
    try {
        const { apiKey, senderId, enabled, enableOrderSms, orderSmsTemplate, enableInvoiceAttachment } = req.body;

        // 1. Update Organization toggle
        await Organization.update(
            { textlk_enabled: !!enabled },
            { where: { id: req.user.organization_id } }
        );

        // 2. Handle Settings
        let setting = await Setting.findOne({
            where: {
                organization_id: req.user.organization_id,
                category: 'textlk_crm',
                branch_id: null
            }
        });

        const currentData = setting ? (typeof setting.settings_data === 'string' ? JSON.parse(setting.settings_data) : setting.settings_data) : {};
        
        const settingsData = { 
            ...currentData, 
            senderId,
            enableOrderSms: !!enableOrderSms,
            orderSmsTemplate: orderSmsTemplate || 'Hi {customer_name}, your order {invoice_number} is successful. Total: {total_amount}',
            enableInvoiceAttachment: !!enableInvoiceAttachment
        };

        if (apiKey && apiKey !== MASK) {
            settingsData.apiKey = encrypt(apiKey);
        } else if (apiKey === MASK && setting) {
            settingsData.apiKey = currentData.apiKey;
        }

        if (setting) {
            await setting.update({ settings_data: settingsData });
        } else {
            await Setting.create({
                organization_id: req.user.organization_id,
                category: 'textlk_crm',
                settings_data: settingsData
            });
        }

        return successResponse(res, { ...settingsData, apiKey: MASK }, 'Text.lk configuration saved');
    } catch (error) { next(error); }
};

const getDriveAuthUrl = async (req, res, next) => {
    try {
        const url = googleDriveService.getAuthUrl();
        return successResponse(res, { url }, 'Auth URL generated');
    } catch (error) { next(error); }
};

const driveCallback = async (req, res, next) => {
    try {
        const { code } = req.body;
        if (!code) return errorResponse(res, 'Code is required', 400);

        const tokens = await googleDriveService.getTokens(code);
        
        if (tokens.refresh_token) {
            let setting = await Setting.findOne({
                where: {
                    organization_id: req.user.organization_id,
                    category: 'textlk_crm',
                    branch_id: null
                }
            });

            const currentData = setting ? (typeof setting.settings_data === 'string' ? JSON.parse(setting.settings_data) : setting.settings_data) : {};
            const settingsData = { ...currentData, googleDriveRefreshToken: encrypt(tokens.refresh_token) };

            if (setting) {
                await setting.update({ settings_data: settingsData });
            } else {
                await Setting.create({
                    organization_id: req.user.organization_id,
                    category: 'textlk_crm',
                    settings_data: settingsData
                });
            }
            return successResponse(res, null, 'Google Drive connected successfully');
        } else {
            return errorResponse(res, 'Could not obtain refresh token. Please revoke access in your Google account and try again.', 400);
        }
    } catch (error) { 
        logger.error(`Drive Callback Error: ${error.message}`);
        return errorResponse(res, 'Failed to authenticate with Google Drive', 500); 
    }
};

const testConnection = async (req, res, next) => {
    try {
        const { apiKey } = req.body;
        let keyToTest = apiKey;

        if (apiKey === MASK) {
            const setting = await Setting.findOne({
                where: { organization_id: req.user.organization_id, category: 'textlk_crm' }
            });
            if (setting) {
                const data = typeof setting.settings_data === 'string' ? JSON.parse(setting.settings_data) : setting.settings_data;
                const { decrypt } = require('../utils/security');
                keyToTest = decrypt(data.apiKey);
            }
        }

        const result = await textLkService.verifyConnection({ apiKey: keyToTest });
        if (result.success) return successResponse(res, null, 'Connected to Text.lk successfully');
        return errorResponse(res, result.error || 'Failed to connect to Text.lk', 400);
    } catch (error) { next(error); }
};

const getContacts = async (req, res, next) => {
    try {
        const { page, limit } = req.query;
        const contacts = await textLkService.getContacts(req.user.organization_id, page, limit);
        return successResponse(res, contacts, 'Contacts fetched');
    } catch (error) { next(error); }
};

const createContactGroup = async (req, res, next) => {
    try {
        const { name } = req.body;
        if (!name) {
            return errorResponse(res, 'Group name is required', 400);
        }
        const result = await textLkService.createGroup(req.user.organization_id, name);
        return successResponse(res, result, 'Contact group created successfully');
    } catch (error) { next(error); }
};

const updateContactGroup = async (req, res, next) => {
    try {
        const { uid } = req.params;
        const { name } = req.body;
        if (!uid) {
            return errorResponse(res, 'Group Unique ID (UID) is required', 400);
        }
        if (!name) {
            return errorResponse(res, 'Group name is required', 400);
        }
        const result = await textLkService.updateGroup(req.user.organization_id, uid, name);
        return successResponse(res, result, 'Contact group updated successfully');
    } catch (error) { next(error); }
};

const deleteContactGroup = async (req, res, next) => {
    try {
        const { uid } = req.params;
        if (!uid) {
            return errorResponse(res, 'Group Unique ID (UID) is required', 400);
        }
        const result = await textLkService.deleteGroup(req.user.organization_id, uid);
        return successResponse(res, result, 'Contact group deleted successfully');
    } catch (error) { next(error); }
};

const sendSms = async (req, res, next) => {
    try {
        const { recipient, message, template_id } = req.body;
        const result = await textLkService.sendSms(req.user.organization_id, { recipient, message, template_id });
        return successResponse(res, result, 'SMS sent successfully');
    } catch (error) { next(error); }
};

const syncCustomers = async (req, res, next) => {
    try {
        // 1. Fetch local customers
        const customers = await Customer.findAll({
            where: { organization_id: req.user.organization_id, is_active: true }
        });

        if (customers.length === 0) return successResponse(res, { synced: 0 }, 'No customers to sync');

        // 2. Ensure a "POS Customers" group exists on Text.lk
        const groupsRes = await textLkService.getGroups(req.user.organization_id);
        const groups = groupsRes.data || [];
        let posGroup = groups.find(g => g.name === 'POS Customers');

        if (!posGroup) {
            const newGroup = await textLkService.createGroup(req.user.organization_id, 'POS Customers');
            posGroup = newGroup.data;
        }

        // 3. Sync each customer
        let syncedCount = 0;
        let failedCount = 0;

        for (const customer of customers) {
            try {
                // Sanitize phone number (remove spaces, ensure it starts with 94 or similar if needed)
                let phone = customer.phone?.replace(/\D/g, '');
                if (!phone) continue;

                await textLkService.createContact(req.user.organization_id, {
                    first_name: customer.first_name || customer.name,
                    last_name: customer.last_name || '',
                    phone: phone,
                    group_id: posGroup.id
                });
                syncedCount++;
            } catch (err) {
                failedCount++;
                logger.error(`Sync Customer Failed (${customer.id}): ${err.message}`);
            }
        }

        return successResponse(res, { synced: syncedCount, failed: failedCount }, `Synced ${syncedCount} customers to Text.lk`);
    } catch (error) { next(error); }
};



const getTemplates = async (req, res, next) => {
    try {
        const templates = await TextLkTemplate.findAll({
            where: { organization_id: req.user.organization_id, is_active: true }
        });
        return successResponse(res, templates, 'Templates fetched');
    } catch (error) { next(error); }
};

const createTemplate = async (req, res, next) => {
    try {
        const { name, body, dlt_template_id } = req.body;
        const template = await TextLkTemplate.create({
            organization_id: req.user.organization_id,
            name,
            body,
            dlt_template_id
        });
        return successResponse(res, template, 'Template created');
    } catch (error) { next(error); }
};

const deleteTemplate = async (req, res, next) => {
    try {
        const { id } = req.params;
        await TextLkTemplate.update(
            { is_active: false },
            { where: { id, organization_id: req.user.organization_id } }
        );
        return successResponse(res, null, 'Template deleted');
    } catch (error) { next(error); }
};

const getCampaigns = async (req, res, next) => {
    try {
        const campaigns = await TextLkCampaign.findAll({
            where: { organization_id: req.user.organization_id },
            order: [['created_at', 'DESC']]
        });
        return successResponse(res, campaigns, 'Campaigns fetched');
    } catch (error) { next(error); }
};

const createCampaign = async (req, res, next) => {
    try {
        const { name, message, contact_list_id, dlt_template_id, schedule_time } = req.body;
        
        // 1. Create local record
        const campaign = await TextLkCampaign.create({
            organization_id: req.user.organization_id,
            name,
            message,
            contact_list_id,
            dlt_template_id,
            schedule_time,
            status: schedule_time ? 'Scheduled' : 'Pending'
        });

        // 2. Send to Text.lk
        try {
            const result = await textLkService.sendCampaign(req.user.organization_id, {
                contact_list_id,
                message,
                dlt_template_id,
                schedule_time
            });

            await campaign.update({
                status: schedule_time ? 'Scheduled' : 'Sent',
                response_data: result
            });

            return successResponse(res, campaign, 'Campaign initiated successfully');
        } catch (err) {
            await campaign.update({ status: 'Failed', response_data: { error: err.message } });
            throw err;
        }
    } catch (error) { next(error); }
};

const getStats = async (req, res, next) => {
    try {
        let balance = 'N/A';
        let totalSent = 0;
        let delivered = 0;
        let failed = 0;
        let logs = [];

        try {
            const balanceData = await textLkService.getBalance(req.user.organization_id);
            if (balanceData && balanceData.data) {
                balance = balanceData.data.remaining_balance || '0';
            }
        } catch (e) {
            logger.warn(`Failed to fetch Text.lk balance: ${e.message}`);
        }

        try {
            const smsLogsRes = await textLkService.getSmsLogs(req.user.organization_id);
            const logsData = smsLogsRes && smsLogsRes.data ? (Array.isArray(smsLogsRes.data.data) ? smsLogsRes.data.data : (Array.isArray(smsLogsRes.data) ? smsLogsRes.data : [])) : [];
            logs = logsData;
            totalSent = logsData.length;
            delivered = logsData.filter(log => log.status === 'Delivered').length;
            failed = logsData.filter(log => log.status === 'Failed' || log.status === 'Undelivered' || log.status === 'FailedToSend').length;
        } catch (e) {
            logger.warn(`Failed to fetch Text.lk SMS logs: ${e.message}`);
        }

        return successResponse(res, {
            balance,
            totalSent,
            delivered,
            failed,
            logs: logs.slice(0, 10)
        }, 'Text.lk statistics fetched successfully');
    } catch (error) { next(error); }
};

module.exports = {
    getConfig,
    saveConfig,
    testConnection,
    getContacts,
    createContactGroup,
    updateContactGroup,
    deleteContactGroup,
    sendSms,
    syncCustomers,
    getTemplates,
    createTemplate,
    deleteTemplate,
    getCampaigns,
    createCampaign,
    getStats,
    getDriveAuthUrl,
    driveCallback
};
