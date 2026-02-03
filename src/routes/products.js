const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const upload = require('../middleware/upload');

router.use(authenticate); // All product routes require authentication

router.get('/', checkPermission('Product View'), productController.getAllProducts);
router.post('/', checkPermission('Product Create'), productController.createProduct);
router.get('/active/list', productController.getActiveProductsList);
router.get('/variants/:variantId', checkPermission('Product View'), productController.getVariantById);
router.get('/stock/check', productController.getProductStock);
router.get('/:id', checkPermission('Product View'), productController.getProductById);
router.post('/opening-stock', checkPermission('Product Create'), productController.createOpeningStock);
router.get('/export', checkPermission('Product View'), productController.exportProducts);
router.post('/import', checkPermission('Product Create'), productController.importProducts);
router.put('/:id', checkPermission('Product Edit'), productController.updateProduct);
router.delete('/:id', checkPermission('Product Delete'), productController.deleteProduct);

// Status toggles
router.patch('/:id/activate', checkPermission('Product Edit'), (req, res, next) => {
    req.params.action = 'activate';
    productController.toggleProductStatus(req, res, next);
});
router.patch('/:id/deactivate', checkPermission('Product Edit'), (req, res, next) => {
    req.params.action = 'deactivate';
    productController.toggleProductStatus(req, res, next);
});
router.patch('/:id/:action', checkPermission('Product Edit'), productController.toggleProductStatus);

// Variant CRUD
router.post('/:id/variants', checkPermission('Product Variant Create'), upload.array('images[]', 10), productController.createVariant);
router.post('/:id/variants/:variantId', checkPermission('Product Variant Edit'), upload.array('images[]', 10), productController.updateVariant);

// Variant toggles
router.patch('/:id/variants/:variantId/activate', checkPermission('Product Edit'), (req, res, next) => {
    req.params.action = 'activate';
    productController.toggleVariantStatus(req, res, next);
});
router.patch('/:id/variants/:variantId/deactivate', checkPermission('Product Edit'), (req, res, next) => {
    req.params.action = 'deactivate';
    productController.toggleVariantStatus(req, res, next);
});
router.patch('/:id/variants/:variantId/:action', checkPermission('Product Edit'), productController.toggleVariantStatus);

module.exports = router;
