const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const upload = require('../middleware/upload');

router.use(authenticate);

router.get('/active-sellers', userController.getActiveSellers);
router.get('/', checkPermission('user:view'), userController.getAllUsers);
router.post('/', checkPermission('user:create'), upload.single('profile_image'), userController.createUser);
router.put('/:id', checkPermission('user:edit'), upload.single('profile_image'), userController.updateUser);
router.patch('/:id/toggle-status', checkPermission('user:edit'), userController.toggleUserStatus);
router.post('/:id/resend-welcome-email', checkPermission('user:edit'), userController.resendWelcomeEmail);

module.exports = router;
