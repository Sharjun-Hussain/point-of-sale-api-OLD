const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

// Stock List
router.get('/', checkPermission('stock:view'), stockController.getAllStocks);

// Stock Adjustments
router.post('/adjust', checkPermission('stock:edit'), stockController.createStockAdjustment);

// Stock Transfers
router.get('/transfers', checkPermission('stock:view'), stockController.getAllTransfers);
router.post('/transfers', checkPermission('stock:edit'), stockController.createStockTransfer);
router.get('/transfers/:id', checkPermission('stock:view'), stockController.getTransferById);

module.exports = router;
