const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

const { updateOrganizationValidationRules } = require('../validations/organizationValidation');
const validate = require('../middleware/validate');
const orgController = require('../controllers/organizationController');

router.use(authenticate);

// Business Profile Settings (Pointed to Centralized Organization Controller)
router.get('/business', checkPermission('system:settings'), settingsController.getBusinessSettings);
router.put('/business', updateOrganizationValidationRules, validate, checkPermission('system:settings'), orgController.updateOrganization);

// Modular Settings (pos, receipt, communication, general)
router.get('/global', checkPermission('system:settings'), settingsController.getGlobalSettings);
router.post('/logo', checkPermission('system:settings'), settingsController.updateLogo);
router.get('/:category', checkPermission('system:settings'), settingsController.getSettingsByCategory);
router.post('/:category', checkPermission('system:settings'), settingsController.updateSettingsByCategory);

module.exports = router;
