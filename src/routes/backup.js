const express = require('express');
const router = express.Router();
const backupController = require('../controllers/backupController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

// Organization Admin Routes
router.get('/download', checkPermission('backup:manual'), backupController.manualDownload);
router.patch('/config', checkPermission('backup:config'), backupController.updateConfig);

// Super Admin Routes
router.patch('/admin/:id/config', checkPermission('backup:admin'), backupController.superAdminUpdateConfig);

module.exports = router;
