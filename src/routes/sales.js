const express = require('express');
const router = express.Router();
const saleController = require('../controllers/saleController');
const saleReturnController = require('../controllers/saleReturnController');
const authenticate = require('../middleware/auth');

router.use(authenticate);

router.get('/', saleController.getAllSales);
router.get('/:id', saleController.getSaleById);
router.post('/', saleController.createSale);
router.delete('/:id', saleController.deleteSale);

// Returns
router.get('/returns/list', saleReturnController.getAllSaleReturns);
router.get('/returns/:id', saleReturnController.getSaleReturnById);
router.post('/returns', saleReturnController.createSaleReturn);

module.exports = router;
