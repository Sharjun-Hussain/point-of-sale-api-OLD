const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

// Business Profile Settings
// Business Profile Settings
router.get('/business', checkPermission('system:settings'), settingsController.getBusinessSettings);
router.put('/business', checkPermission('system:settings'), settingsController.updateBusinessSettings);

// Modular Settings (pos, receipt, communication, general)
router.get('/global', checkPermission('system:settings'), settingsController.getGlobalSettings);
router.post('/logo', checkPermission('system:settings'), settingsController.updateLogo);
router.get('/:category', checkPermission('system:settings'), settingsController.getSettingsByCategory);
router.post('/:category', checkPermission('system:settings'), settingsController.updateSettingsByCategory);

module.exports = router;
