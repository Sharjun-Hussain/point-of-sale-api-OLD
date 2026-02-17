const express = require('express');
const router = express.Router();
const orgController = require('../controllers/organizationController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const upload = require('../middleware/upload');

router.use(authenticate);

router.post('/create', upload.single('logo'), checkPermission('Organization Create'), orgController.createOrganization);
// Super Admin should see all organizations
router.get('/', checkPermission('Organization View'), orgController.getAllOrganizations); // Changed from getOrganization
router.get('/me', checkPermission('Organization View'), orgController.getOrganization);
router.put('/', checkPermission('Organization Edit'), orgController.updateOrganization);
router.put('/me', checkPermission('Organization Edit'), orgController.updateOrganization);

// Admin Routes for specific Organization ID
router.get('/:id', checkPermission('Organization View'), orgController.getOrganizationById);
router.patch('/:id', upload.single('logo'), checkPermission('Organization Edit'), orgController.updateOrganizationById);
router.patch('/:id/status/:action', checkPermission('Organization Edit'), orgController.toggleOrganizationStatus);
router.patch('/:id/status', checkPermission('Organization Edit'), orgController.toggleOrganizationStatus);
router.get('/:id/subscription-history', checkPermission('Organization View'), orgController.getSubscriptionHistory);

module.exports = router;
