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
router.put('/', upload.single('logo'), updateOrganizationValidationRules, validate, checkPermission('org:edit'), orgController.updateOrganization);
router.put('/me', upload.single('logo'), updateOrganizationValidationRules, validate, checkPermission('org:edit'), orgController.updateOrganization);

// Onboarding Tour Management
router.get('/onboarding', orgController.getOnboardingStatus);
router.post('/onboarding/complete', orgController.updateOnboardingStatus);
router.post('/onboarding/policy', orgController.updateOnboardingPolicy); // For current org

// Admin Routes for specific Organization ID
router.get('/:id/full-details', checkPermission('org:view'), orgController.getOrganizationFullDetails);
router.get('/:id', checkPermission('org:view'), orgController.getOrganizationById);
router.patch('/:id', upload.single('logo'), checkPermission('org:edit'), orgController.updateOrganizationById);
router.patch('/:id/status/:action', checkPermission('org:edit'), orgController.toggleOrganizationStatus);
router.patch('/:id/status', checkPermission('org:edit'), orgController.toggleOrganizationStatus);
router.patch('/:id/shopify', checkPermission('org:edit'), orgController.toggleShopifyIntegration);
router.patch('/:id/whatsapp', checkPermission('org:edit'), orgController.toggleWhatsAppIntegration);
router.patch('/:id/loyalty', checkPermission('org:edit'), orgController.toggleLoyaltyIntegration);
router.patch('/:id/:action', checkPermission('org:edit'), orgController.toggleOrganizationStatus); // Alias for frontend compatibility
router.get('/:id/subscription-history', checkPermission('org:view'), orgController.getSubscriptionHistory);
router.post('/:id/onboarding/policy', checkPermission('org:edit'), orgController.updateOnboardingPolicy);


module.exports = router;
