const express = require('express');
const router = express.Router();
const orgController = require('../controllers/organizationController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('Organization View'), orgController.getOrganization);
router.get('/me', checkPermission('Organization View'), orgController.getOrganization);
router.put('/', checkPermission('Organization Edit'), orgController.updateOrganization);
router.put('/me', checkPermission('Organization Edit'), orgController.updateOrganization);

module.exports = router;
