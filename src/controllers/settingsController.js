const { Organization, Setting } = require('../models');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auditService = require('../services/auditService');

// Configure Multer for Logo Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../../uploads/logos');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'));
        }
    }
}).single('logo');

/**
 * Get Business Profile Settings (Organization Model)
 */
const getBusinessSettings = async (req, res, next) => {
    try {
        const organization = await Organization.findByPk(req.user.organization_id);
        if (!organization) return errorResponse(res, 'Organization not found', 404);

        return successResponse(res, organization, 'Business settings fetched');
    } catch (error) { next(error); }
};

/**
 * Update Business Profile Settings
 */
// Business settings updates have been moved to organizationController.updateOrganization 
// for centralized validation and audit tracking.

/**
 * Helper to sanitize corrupted settings data (index-keyed objects or strings)
 */
const sanitizeSettings = (data) => {
    if (!data) return {};

    // 1. If data is a string, try to parse it
    if (typeof data === 'string') {
        try {
            return sanitizeSettings(JSON.parse(data)); // Recursive call to handle nested corruption
        } catch (e) {
            console.error("Failed to parse settings string:", e);
            return {};
        }
    }

    // 2. Check if data is an object with sequential numeric keys (corruption indicator)
    if (typeof data === 'object' && !Array.isArray(data)) {
        const keys = Object.keys(data);
        if (keys.length > 2 && keys.every(k => !isNaN(k))) { // Lowered threshold to catch smaller corruptions
            try {
                // Attempt to reconstruct the string
                const sortedKeys = keys.sort((a, b) => Number(a) - Number(b));
                const reconstructed = sortedKeys.map(k => data[k]).join('');

                // Try parsing the reconstructed string
                return JSON.parse(reconstructed);
            } catch (e) {
                console.error("Failed to sanitize corrupted settings:", e);
                return {};
            }
        }
    }
    return data;
};

/**
 * Get Modular Settings (POS, Receipt, etc.)
 */
const getSettingsByCategory = async (req, res, next) => {
    try {
        const { category } = req.params;
        const branch_id = req.query.branch_id || null;

        const setting = await Setting.findOne({
            where: {
                organization_id: req.user.organization_id,
                branch_id,
                category
            }
        });

        // SANITIZE: Clean data before sending to frontend
        const cleanData = setting ? sanitizeSettings(setting.settings_data) : {};

        return successResponse(res, cleanData, `${category} settings fetched`);
    } catch (error) { next(error); }
};

/**
 * Update Modular Settings
 */
const updateSettingsByCategory = async (req, res, next) => {
    try {
        const { category } = req.params;
        const { settings_data, branch_id } = req.body;

        // SANITIZE: Clean incoming data before saving
        const cleanData = sanitizeSettings(settings_data);

        const [setting, created] = await Setting.findOrCreate({
            where: {
                organization_id: req.user.organization_id,
                branch_id: branch_id || null,
                category
            },
            defaults: { settings_data: cleanData }
        });

        if (!created) {
            await setting.update({ settings_data: cleanData });
        }

        // Log settings update
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCustom(
            req.user.organization_id,
            req.user.id,
            'UPDATE_SETTINGS',
            `Updated ${category} settings`,
            ipAddress,
            userAgent,
            { category, branch_id }
        );

        return successResponse(res, cleanData, `${category} settings saved`);
    } catch (error) { next(error); }
};

/**
 * Get All Settings (Global Unified API)
 */
const getGlobalSettings = async (req, res, next) => {
    try {
        const [organization, modularSettings] = await Promise.all([
            Organization.findByPk(req.user.organization_id),
            Setting.findAll({ where: { organization_id: req.user.organization_id } })
        ]);

        const settings = {
            business: organization,
            modules: modularSettings.reduce((acc, curr) => {
                // SANITIZE: Clean global data aggregation as well
                acc[curr.category] = sanitizeSettings(curr.settings_data);
                return acc;
            }, {})
        };

        return successResponse(res, settings, 'Global settings fetched');
    } catch (error) { next(error); }
};

/**
 * Update Business Logo
 */
const updateLogo = async (req, res, next) => {
    upload(req, res, async (err) => {
        if (err) return errorResponse(res, err.message, 400);
        if (!req.file) return errorResponse(res, 'No file uploaded', 400);

        try {
            const organization = await Organization.findByPk(req.user.organization_id);
            if (!organization) return errorResponse(res, 'Organization not found', 404);

            // Delete old logo if exists
            if (organization.logo) {
                const oldPath = path.join(__dirname, '../../', organization.logo);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }

            const logoPath = `uploads/logos/${req.file.filename}`;
            await organization.update({ logo: logoPath });

            // Log logo update
            const { ipAddress, userAgent } = auditService.getRequestContext(req);
            await auditService.logCustom(
                req.user.organization_id,
                req.user.id,
                'UPDATE_LOGO',
                'Business logo updated',
                ipAddress,
                userAgent
            );

            return successResponse(res, { logo: logoPath }, 'Logo updated successfully');
        } catch (error) { next(error); }
    });
};

module.exports = {
    getBusinessSettings,
    getSettingsByCategory,
    updateSettingsByCategory,
    getGlobalSettings,
    updateLogo
};
