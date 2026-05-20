const express = require('express');
const router = express.Router();
const customEcommerceController = require('../controllers/customEcommerceController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/config', checkPermission('settings:manage'), customEcommerceController.getConfig);
router.post('/config', checkPermission('settings:manage'), customEcommerceController.saveConfig);
router.post('/token', checkPermission('settings:manage'), customEcommerceController.generateInboundToken);
router.post('/verify', checkPermission('settings:manage'), customEcommerceController.testConnection);
router.post('/push', checkPermission('settings:manage'), customEcommerceController.pushInventory);
router.get('/products', checkPermission('settings:manage'), customEcommerceController.getLocalProducts);
router.post('/products/sync', checkPermission('settings:manage'), customEcommerceController.updateProductSync);

module.exports = router;
