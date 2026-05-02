const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const authenticate = require('../middleware/auth');
const { checkPermission, checkAnyPermission } = require('../middleware/permission');

const { updateOrganizationValidationRules } = require('../validations/organizationValidation');
const validate = require('../middleware/validate');
const orgController = require('../controllers/organizationController');

router.use(authenticate);

// Business Profile Settings
router.get('/business', checkAnyPermission(['settings:business:update', 'system:settings']), settingsController.getBusinessSettings);
router.put('/business', updateOrganizationValidationRules, validate, checkPermission('settings:business:update'), orgController.updateOrganization);

// Modular Settings
router.get('/global', checkAnyPermission(['settings:general:update', 'system:settings']), settingsController.getGlobalSettings);
router.post('/logo', checkPermission('settings:business:update'), settingsController.updateLogo);

router.get('/:category', (req, res, next) => {
    const { category } = req.params;
    checkAnyPermission([`settings:${category}:update`, 'system:settings'])(req, res, next);
}, settingsController.getSettingsByCategory);

router.post('/test-connection', (req, res, next) => {
    const { type } = req.body; // type is email/sms/ai
    const categoryMap = { 'email': 'communication', 'sms': 'communication', 'ai': 'ai' };
    const category = categoryMap[type] || 'communication';
    checkAnyPermission([`settings:${category}:update`, 'system:settings'])(req, res, next);
}, settingsController.testConnection);

router.post('/:category', (req, res, next) => {
    const { category } = req.params;
    checkPermission(`settings:${category}:update`)(req, res, next);
}, settingsController.updateSettingsByCategory);

module.exports = router;
