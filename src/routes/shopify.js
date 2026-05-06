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
router.get('/products', checkPermission('settings:manage'), shopifyController.getLocalProducts);
router.get('/shopify-products', checkPermission('settings:manage'), shopifyController.getShopifyProducts);
router.get('/shopify-orders', checkPermission('settings:manage'), shopifyController.getShopifyOrders);
router.get('/store-details', checkPermission('settings:manage'), shopifyController.getStoreDetails);
router.post('/products/sync', checkPermission('settings:manage'), shopifyController.updateProductSync);

module.exports = router;
