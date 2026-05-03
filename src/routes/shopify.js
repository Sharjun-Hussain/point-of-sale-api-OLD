const express = require('express');
const router = express.Router();
const shopifyController = require('../controllers/shopifyController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/config', checkPermission('settings:manage'), shopifyController.getConfig);
router.post('/config', checkPermission('settings:manage'), shopifyController.saveConfig);
router.post('/verify', checkPermission('settings:manage'), shopifyController.testConnection);
router.post('/push', checkPermission('settings:manage'), shopifyController.pushInventory);
router.post('/pull', checkPermission('settings:manage'), shopifyController.pullProducts);
router.get('/analytics', checkPermission('settings:manage'), shopifyController.getAnalytics);

module.exports = router;
