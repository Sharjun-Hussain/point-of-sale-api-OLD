const express = require('express');
const router = express.Router();
const orgController = require('../controllers/organizationController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const upload = require('../middleware/upload');

const { updateOrganizationValidationRules } = require('../validations/organizationValidation');
const validate = require('../middleware/validate');
const isMaster = require('../middleware/isMaster');

router.use(authenticate);

router.post('/create', isMaster, upload.single('logo'), checkPermission('org:create'), orgController.createOrganization);
// Super Admin should see all organizations
router.get('/stats', isMaster, checkPermission('org:view'), orgController.getSuperAdminStats);
router.get('/', isMaster, checkPermission('org:view'), orgController.getAllOrganizations); // Changed from getOrganization
router.get('/me', checkPermission('org:view'), orgController.getOrganization);

// Synchronized Business Identity Updates
router.put('/', upload.single('logo'), updateOrganizationValidationRules, validate, checkPermission('org:edit'), orgController.updateOrganization);
router.put('/me', upload.single('logo'), updateOrganizationValidationRules, validate, checkPermission('org:edit'), orgController.updateOrganization);

// Onboarding Tour Management
router.get('/onboarding', orgController.getOnboardingStatus);
router.post('/onboarding/complete', orgController.updateOnboardingStatus);
router.post('/onboarding/policy', orgController.updateOnboardingPolicy); // For current org

// Admin Routes for specific Organization ID
router.patch('/:id/reset-admin-password', isMaster, checkPermission('org:edit'), orgController.resetAdminPassword);
router.get('/:id/full-details', isMaster, checkPermission('org:view'), orgController.getOrganizationFullDetails);
router.get('/:id', isMaster, checkPermission('org:view'), orgController.getOrganizationById);
router.put('/:id', isMaster, upload.single('logo'), checkPermission('org:edit'), orgController.updateOrganizationById);
router.patch('/:id', isMaster, upload.single('logo'), checkPermission('org:edit'), orgController.updateOrganizationById); // Alias for compatibility
router.post('/:id', isMaster, upload.single('logo'), checkPermission('org:edit'), orgController.updateOrganizationById); // Alias for multipart/form-data method override
router.patch('/:id/shopify', isMaster, checkPermission('org:edit'), orgController.toggleShopifyIntegration);
router.patch('/:id/whatsapp', isMaster, checkPermission('org:edit'), orgController.toggleWhatsAppIntegration);
router.patch('/:id/loyalty', isMaster, checkPermission('org:edit'), orgController.toggleLoyaltyIntegration);
router.patch('/:id/backup', isMaster, checkPermission('backup:admin'), orgController.toggleBackupFeature);
router.get('/:id/subscription-history', isMaster, checkPermission('org:view'), orgController.getSubscriptionHistory);
router.patch('/:id/plan', isMaster, checkPermission('org:edit'), orgController.updateOrganizationPlan);
router.patch('/:id/modules', isMaster, checkPermission('org:edit'), orgController.updateOrganizationModules);
router.patch('/:id/extend-trial', isMaster, checkPermission('org:edit'), orgController.extendOrganizationTrial);
router.patch('/:id/status/:action', isMaster, checkPermission('org:edit'), orgController.toggleOrganizationStatus);
router.patch('/:id/status', isMaster, checkPermission('org:edit'), orgController.toggleOrganizationStatus);
router.patch('/:id/:action', isMaster, checkPermission('org:edit'), orgController.toggleOrganizationStatus); // Alias for frontend compatibility
router.post('/:id/onboarding/policy', isMaster, checkPermission('org:edit'), orgController.updateOnboardingPolicy);


module.exports = router;
