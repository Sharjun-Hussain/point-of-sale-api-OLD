const express = require('express');
const router = express.Router();
const customEcommerceController = require('../controllers/customEcommerceController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/config', checkPermission('settings:general:update'), customEcommerceController.getConfig);
router.post('/config', checkPermission('settings:general:update'), customEcommerceController.saveConfig);
router.post('/token', checkPermission('settings:general:update'), customEcommerceController.generateInboundToken);
router.post('/verify', checkPermission('settings:general:update'), customEcommerceController.testConnection);
router.post('/push', checkPermission('settings:general:update'), customEcommerceController.pushInventory);
router.get('/products', checkPermission('settings:general:update'), customEcommerceController.getLocalProducts);
router.post('/products/sync', checkPermission('settings:general:update'), customEcommerceController.updateProductSync);

module.exports = router;
