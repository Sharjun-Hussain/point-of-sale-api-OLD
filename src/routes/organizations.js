const express = require('express');
const router = express.Router();
const orgController = require('../controllers/organizationController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/me', checkPermission('Organization View'), orgController.getOrganization);
router.put('/me', checkPermission('Organization Edit'), orgController.updateOrganization);

module.exports = router;
