const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

// Business Profile Settings
// Business Profile Settings
router.get('/business', checkPermission('Settings View'), settingsController.getBusinessSettings);
router.put('/business', checkPermission('Settings Edit'), settingsController.updateBusinessSettings);

// Modular Settings (pos, receipt, communication, general)
router.get('/global', checkPermission('Settings View'), settingsController.getGlobalSettings);
router.post('/logo', checkPermission('Settings Edit'), settingsController.updateLogo);
router.get('/:category', checkPermission('Settings View'), settingsController.getSettingsByCategory);
router.post('/:category', checkPermission('Settings Edit'), settingsController.updateSettingsByCategory);

module.exports = router;
