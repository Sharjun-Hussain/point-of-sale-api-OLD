const cron = require('node-cron');
const { Organization } = require('../models');
const backupService = require('../services/backupService');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

/**
 * Scheduled job to handle automated backups
 * Runs every day at 01:00 AM
 */
const scheduleBackupJob = async () => {
    logger.info('⏰ [BACKUP_JOB] Scheduler initialized. Checking for due backups daily at 01:00 AM.');

    cron.schedule('0 1 * * *', async () => {
        try {
            logger.info('[BACKUP_JOB] Starting daily automated backup cycle...');
            
            const organizations = await Organization.findAll({
                where: {
                    backup_enabled: true,
                    auto_backup_enabled: true
                }
            });

            const now = new Date();

            for (const org of organizations) {
                let shouldBackup = false;
                
                if (!org.last_backup_date) {
                    shouldBackup = true;
                } else {
                    const lastBackup = new Date(org.last_backup_date);
                    const diffDays = Math.floor((now - lastBackup) / (1000 * 60 * 60 * 24));

                    switch (org.backup_frequency) {
                        case 'Daily':
                            if (diffDays >= 1) shouldBackup = true;
                            break;
                        case 'Weekly':
                            if (diffDays >= 7) shouldBackup = true;
                            break;
                        case 'Monthly':
                            if (diffDays >= 30) shouldBackup = true;
                            break;
                    }
                }

                if (shouldBackup) {
                    logger.info(`[BACKUP_JOB] Triggering backup for ${org.name} (Frequency: ${org.backup_frequency})`);
                    // We don't await here to prevent one organization's failure or long-running backup from blocking others
                    backupService.sendBackupEmail(org.id).catch(err => {
                        logger.error(`[BACKUP_JOB] Failed for ${org.name}: ${err.message}`);
                    });
                }
            }
        } catch (error) {
            logger.error(`[BACKUP_JOB] Fatal Error: ${error.message}`);
        }
    });
};

module.exports = { scheduleBackupJob };
