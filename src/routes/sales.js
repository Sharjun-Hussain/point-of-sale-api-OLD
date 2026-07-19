const express = require('express');
const router = express.Router();
const saleController = require('../controllers/saleController');
const saleReturnController = require('../controllers/saleReturnController');
const { generateSaleInvoicePdf } = require('../controllers/salePdfController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('sale:view'), saleController.getAllSales);
// PDF route BEFORE /:id to avoid param collision
router.get('/invoice/:id/pdf', checkPermission('sale:view'), generateSaleInvoicePdf);
router.get('/:id', checkPermission('sale:view'), saleController.getSaleById);
router.post('/', checkPermission('sale:create'), saleController.createSale);
router.put('/:id/settle', checkPermission('sale:create'), saleController.settleTableSale);
router.put('/:id/append', checkPermission('sale:create'), saleController.updateActiveTableSale);
router.delete('/:id', checkPermission('sale:delete'), saleController.deleteSale);

// Returns
router.get('/returns/list', checkPermission('sale:view'), saleReturnController.getAllSaleReturns);
router.get('/returns/:id', checkPermission('sale:view'), saleReturnController.getSaleReturnById);
router.post('/returns', checkPermission('sale:create'), saleReturnController.createSaleReturn);

module.exports = router;
