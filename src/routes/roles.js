const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('role:view'), roleController.getAllRoles);
router.post('/', checkPermission('role:create'), roleController.createRole);
router.put('/:id', checkPermission('role:edit'), roleController.updateRole);
router.delete('/:id', checkPermission('role:delete'), roleController.deleteRole);
router.get('/permissions', checkPermission('role:view'), roleController.getAllPermissions);

module.exports = router;
