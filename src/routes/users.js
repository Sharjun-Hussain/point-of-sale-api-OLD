const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/active-sellers', userController.getActiveSellers);
router.get('/', checkPermission('User View'), userController.getAllUsers);
router.post('/', checkPermission('User Create'), userController.createUser);
router.put('/:id', checkPermission('User Edit'), userController.updateUser);
router.patch('/:id/toggle-status', checkPermission('User Edit'), userController.toggleUserStatus);

module.exports = router;
