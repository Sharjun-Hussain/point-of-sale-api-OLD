const backupService = require('../services/backupService');
const { Organization } = require('../models');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const fs = require('fs');
const logger = require('../utils/logger');

class BackupController {
    /**
     * Manual download of organization backup
     */
    async manualDownload(req, res, next) {
        try {
            const organizationId = req.user.organization_id;
            const org = await Organization.findByPk(organizationId);

            const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');

            if (!org.backup_enabled) {
                return errorResponse(res, 'Backup features are disabled for your organization.', 403);
            }

            if (!org.manual_download_enabled && !isSuperAdmin) {
                return errorResponse(res, 'Manual backup download is not enabled for your organization. Please contact the administrator.', 403);
            }

            const { zipPath, filename } = await backupService.generateOrganizationBackup(organizationId);

            res.download(zipPath, filename, (err) => {
                if (err) {
                    logger.error(`[BACKUP] Download failed: ${err.message}`);
                }
                // We keep the file in the backups folder as a history, or we could delete it.
                // For now, let's keep it but maybe implement a cleanup job later.
            });
        } catch (error) { next(error); }
    }

    /**
     * Update organization-specific backup configuration
     */
    async updateConfig(req, res, next) {
        try {
            const organizationId = req.user.organization_id;
            const { auto_backup_enabled, backup_frequency, backup_email } = req.body;

            const org = await Organization.findByPk(organizationId);
            if (!org.backup_enabled) {
                return errorResponse(res, 'Backup features are disabled for your organization.', 403);
            }

            await org.update({
                auto_backup_enabled,
                backup_frequency,
                backup_email: backup_email || org.email // Default to business email if empty
            });

            return successResponse(res, org, 'Backup configuration updated successfully.');
        } catch (error) { next(error); }
    }

    /**
     * Super Admin: Update organization backup configuration (including enabling the feature)
     */
    async superAdminUpdateConfig(req, res, next) {
        try {
            const { id } = req.params; // Organization ID
            const { backup_enabled, manual_download_enabled, auto_backup_enabled, backup_frequency, backup_email } = req.body;

            const org = await Organization.findByPk(id);
            if (!org) return errorResponse(res, 'Organization not found.', 404);

            await org.update({
                backup_enabled,
                manual_download_enabled,
                auto_backup_enabled,
                backup_frequency,
                backup_email: backup_email || org.email
            });

            return successResponse(res, org, 'Organization backup policy updated by Super Admin.');
        } catch (error) { next(error); }
    }
}

module.exports = new BackupController();
