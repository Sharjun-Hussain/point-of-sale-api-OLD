const express = require('express');
const router = express.Router();
const shopifyController = require('../controllers/shopifyController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/config', checkPermission('settings:manage'), shopifyController.getConfig);
router.post('/config', checkPermission('settings:manage'), shopifyController.saveConfig);
router.post('/verify', checkPermission('settings:manage'), shopifyController.testConnection);

module.exports = router;
