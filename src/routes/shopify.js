const express = require('express');
const router = express.Router();
const shopifyController = require('../controllers/shopifyController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/config', checkPermission('settings:general:update'), shopifyController.getConfig);
router.post('/config', checkPermission('settings:general:update'), shopifyController.saveConfig);
router.post('/verify', checkPermission('settings:general:update'), shopifyController.testConnection);
router.post('/push', checkPermission('settings:general:update'), shopifyController.pushInventory);
router.post('/pull', checkPermission('settings:general:update'), shopifyController.pullProducts);
router.get('/analytics', checkPermission('settings:general:update'), shopifyController.getAnalytics);
router.get('/products', checkPermission('settings:general:update'), shopifyController.getLocalProducts);
router.get('/shopify-products', checkPermission('settings:general:update'), shopifyController.getShopifyProducts);
router.get('/shopify-orders', checkPermission('settings:general:update'), shopifyController.getShopifyOrders);
router.get('/store-details', checkPermission('settings:general:update'), shopifyController.getStoreDetails);
router.post('/products/sync', checkPermission('settings:general:update'), shopifyController.updateProductSync);
router.post('/products/create', checkPermission('settings:general:update'), shopifyController.createProduct);
router.post('/products/bulk-create', checkPermission('settings:general:update'), shopifyController.bulkCreateProducts);
router.post('/products/update-status', checkPermission('settings:general:update'), shopifyController.updateProductStatus);
router.post('/products/delete', checkPermission('settings:general:update'), shopifyController.deleteProduct);
router.post('/disconnect', checkPermission('settings:general:update'), shopifyController.disconnectStore);

module.exports = router;
