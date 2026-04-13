const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authenticate = require('../middleware/auth');
const validate = require('../middleware/validate');
const upload = require('../middleware/upload');
const { loginValidationRules, registerValidationRules } = require('../validations/authValidation');

// Public routes
router.post('/login', loginValidationRules, validate, authController.login);
router.post('/register', registerValidationRules, validate, authController.register);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

// Protected routes
router.get('/me', authenticate, authController.me);
router.put('/me', authenticate, upload.single('profile_image'), authController.updateMe);

module.exports = router;
