const models = require('../models');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const mailer = require('../utils/mailer');
const logger = require('../utils/logger');

class BackupService {
    /**
     * Generate a ZIP backup of all data for a specific organization
     */
    async generateOrganizationBackup(organizationId) {
        const org = await models.Organization.findByPk(organizationId);
        if (!org) throw new Error('Organization not found');

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `backup_${org.name.replace(/\s+/g, '_')}_${timestamp}.zip`;
        const uploadPath = process.env.UPLOAD_PATH || 'uploads/';
        const backupDir = path.join(uploadPath, 'backups', organizationId);
        
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const zipPath = path.join(backupDir, filename);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        return new Promise(async (resolve, reject) => {
            output.on('close', () => resolve({ zipPath, filename }));
            archive.on('error', (err) => reject(err));
            archive.pipe(output);

            // Fetch data from all models that have organization_id
            const modelNames = Object.keys(models);
            
            for (const modelName of modelNames) {
                const model = models[modelName];
                
                // Skip non-Sequelize model attributes
                if (!model || typeof model.findAll !== 'function') continue;
                if (!model.rawAttributes) continue;

                try {
                    if (model.rawAttributes.organization_id) {
                        const data = await model.findAll({
                            where: { organization_id: organizationId },
                            raw: true
                        });

                        if (data.length > 0) {
                            archive.append(JSON.stringify(data, null, 2), { name: `${modelName}.json` });
                        }
                    } else if (modelName === 'Organization') {
                        // Export only this organization's record
                        const data = await model.findByPk(organizationId, { raw: true });
                        if (data) {
                            archive.append(JSON.stringify(data, null, 2), { name: 'Organization_Profile.json' });
                        }
                    }
                } catch (err) {
                    logger.error(`[BACKUP] Error exporting model ${modelName}: ${err.message}`);
                }
            }

            archive.finalize();
        });
    }

    /**
     * Generate backup and send it via email
     */
    async sendBackupEmail(organizationId) {
        const org = await models.Organization.findByPk(organizationId);
        if (!org) {
            logger.error(`[BACKUP] Organization ${organizationId} not found for email dispatch.`);
            return;
        }

        // Feature check
        if (!org.backup_enabled || !org.auto_backup_enabled) {
            logger.warn(`[BACKUP] Backup feature or auto-backup disabled for Org: ${org.name} (${organizationId})`);
            return;
        }

        const recipientEmail = org.backup_email || org.email;
        if (!recipientEmail) {
            logger.error(`[BACKUP] No recipient email configured for Org: ${org.name}`);
            return;
        }

        try {
            logger.info(`[BACKUP] Initializing automated backup for ${org.name}...`);
            const { zipPath, filename } = await this.generateOrganizationBackup(organizationId);
            
            await mailer.sendEmailWithSettings({
                to: recipientEmail,
                subject: `📊 Automated Data Backup - ${org.name}`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                        <h2 style="color: #059669;">Scheduled Backup Successful</h2>
                        <p>Hello,</p>
                        <p>Your scheduled data backup for <b>${org.name}</b> has been generated successfully.</p>
                        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 0; font-size: 14px; color: #64748b;"><b>Filename:</b> ${filename}</p>
                            <p style="margin: 5px 0 0 0; font-size: 14px; color: #64748b;"><b>Timestamp:</b> ${new Date().toUTCString()}</p>
                        </div>
                        <p style="font-size: 13px; color: #94a3b8;">This is an automated security protocol. Please keep this file in a secure location.</p>
                    </div>
                `,
                attachments: [
                    {
                        filename: filename,
                        path: zipPath
                    }
                ]
            }, organizationId);

            // Update last backup date
            await org.update({ last_backup_date: new Date() });
            
            logger.info(`[BACKUP] Automated backup dispatched to ${recipientEmail} for Org: ${org.name}`);
        } catch (error) {
            logger.error(`[BACKUP] Automated dispatch failed for Org: ${org.name} - ${error.message}`);
        }
    }
}

module.exports = new BackupService();
