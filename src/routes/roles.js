const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('Role View'), roleController.getAllRoles);
router.post('/', checkPermission('Role Create'), roleController.createRole);
router.put('/:id', checkPermission('Role Edit'), roleController.updateRole);
router.get('/permissions', checkPermission('Role View'), roleController.getAllPermissions);

module.exports = router;
