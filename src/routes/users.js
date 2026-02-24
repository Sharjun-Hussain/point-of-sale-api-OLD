const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/active-sellers', userController.getActiveSellers);
router.get('/', checkPermission('user:view'), userController.getAllUsers);
router.post('/', checkPermission('user:create'), userController.createUser);
router.put('/:id', checkPermission('user:edit'), userController.updateUser);
router.patch('/:id/toggle-status', checkPermission('user:edit'), userController.toggleUserStatus);

module.exports = router;
