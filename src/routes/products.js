const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const upload = require('../middleware/upload');

router.use(authenticate); // All product routes require authentication

router.get('/', checkPermission('product:view'), productController.getAllProducts);
router.post('/', checkPermission('product:create'), upload.array('images[]', 10), productController.createProduct);
router.get('/active/list', productController.getActiveProductsList);
router.get('/variants/:variantId', checkPermission('product:view'), productController.getVariantById);
router.get('/stock/check', productController.getProductStock);
router.get('/:id', checkPermission('product:view'), productController.getProductById);
router.post('/opening-stock', checkPermission('product:create'), productController.createOpeningStock);
router.get('/export', checkPermission('product:view'), productController.exportProducts);
router.post('/import', checkPermission('product:create'), productController.importProducts);
router.put('/:id', checkPermission('product:edit'), upload.array('images[]', 10), productController.updateProduct);
router.delete('/:id', checkPermission('product:delete'), productController.deleteProduct);

// Status toggles
router.patch('/:id/activate', checkPermission('product:edit'), (req, res, next) => {
    req.params.action = 'activate';
    productController.toggleProductStatus(req, res, next);
});
router.patch('/:id/deactivate', checkPermission('product:edit'), (req, res, next) => {
    req.params.action = 'deactivate';
    productController.toggleProductStatus(req, res, next);
});
router.patch('/:id/:action', checkPermission('product:edit'), productController.toggleProductStatus);

// Variant CRUD
router.post('/:id/variants', checkPermission('product_variant:create'), upload.array('images[]', 10), productController.createVariant);
router.post('/:id/variants/:variantId', checkPermission('product_variant:edit'), upload.array('images[]', 10), productController.updateVariant);

// Variant toggles
router.patch('/:id/variants/:variantId/activate', checkPermission('product:edit'), (req, res, next) => {
    req.params.action = 'activate';
    productController.toggleVariantStatus(req, res, next);
});
router.patch('/:id/variants/:variantId/deactivate', checkPermission('product:edit'), (req, res, next) => {
    req.params.action = 'deactivate';
    productController.toggleVariantStatus(req, res, next);
});
router.patch('/:id/variants/:variantId/:action', checkPermission('product:edit'), productController.toggleVariantStatus);

module.exports = router;
