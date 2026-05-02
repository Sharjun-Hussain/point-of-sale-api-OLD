const express = require('express');
const router = express.Router();
const orgController = require('../controllers/organizationController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const upload = require('../middleware/upload');

const { updateOrganizationValidationRules } = require('../validations/organizationValidation');
const validate = require('../middleware/validate');

router.use(authenticate);

router.post('/create', upload.single('logo'), checkPermission('org:create'), orgController.createOrganization);
// Super Admin should see all organizations
router.get('/stats', checkPermission('org:view'), orgController.getSuperAdminStats);
router.get('/', checkPermission('org:view'), orgController.getAllOrganizations); // Changed from getOrganization
router.get('/me', checkPermission('org:view'), orgController.getOrganization);

// Synchronized Business Identity Updates
router.put('/', updateOrganizationValidationRules, validate, checkPermission('org:edit'), orgController.updateOrganization);
router.put('/me', updateOrganizationValidationRules, validate, checkPermission('org:edit'), orgController.updateOrganization);

// Admin Routes for specific Organization ID
router.get('/:id', checkPermission('org:view'), orgController.getOrganizationById);
router.patch('/:id', upload.single('logo'), checkPermission('org:edit'), orgController.updateOrganizationById);
router.patch('/:id/status/:action', checkPermission('org:edit'), orgController.toggleOrganizationStatus);
router.patch('/:id/status', checkPermission('org:edit'), orgController.toggleOrganizationStatus);
router.patch('/:id/:action', checkPermission('org:edit'), orgController.toggleOrganizationStatus); // Alias for frontend compatibility
router.get('/:id/subscription-history', checkPermission('org:view'), orgController.getSubscriptionHistory);

module.exports = router;
