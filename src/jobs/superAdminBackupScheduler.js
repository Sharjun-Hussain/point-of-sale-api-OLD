const cron = require('node-cron');
const backupService = require('../services/backupService');
const logger = require('../utils/logger');

/**
 * Scheduled job to handle daily encrypted SQL backups for the Super Admin
 * Runs every day at 06:00 AM
 */
const scheduleSuperAdminBackupJob = async () => {
    logger.info('⏰ [BACKUP_JOB] Super Admin SQL Backup Scheduler initialized. Running daily at 06:00 AM.');

    cron.schedule('0 6 * * *', async () => {
        try {
            logger.info('[BACKUP_JOB] Starting daily Super Admin automated backup cycle...');
            await backupService.sendSuperAdminBackupEmail('mrjoon005@gmail.com');
        } catch (error) {
            logger.error(`[BACKUP_JOB] Super Admin Backup Fatal Error: ${error.message}`);
        }
    });
};

module.exports = { scheduleSuperAdminBackupJob };
