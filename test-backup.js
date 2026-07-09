require('dotenv').config();
const backupService = require('./src/services/backupService');

(async () => {
    try {
        console.log('Initiating test for Super Admin Backup Email...');
        await backupService.sendSuperAdminBackupEmail('mrjoon005@gmail.com');
        console.log('Test function executed successfully. Please check your email.');
        process.exit(0);
    } catch (error) {
        console.error('Error during test execution:', error);
        process.exit(1);
    }
})();
