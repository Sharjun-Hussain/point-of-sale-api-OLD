const express = require('express');
const router = express.Router();
const purchaseReturnController = require('../controllers/purchaseReturnController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('purchase:view'), purchaseReturnController.getAllPurchaseReturns);
router.get('/:id', checkPermission('purchase:view'), purchaseReturnController.getPurchaseReturnById);
router.post('/', checkPermission('purchase:create'), purchaseReturnController.createPurchaseReturn);

module.exports = router;
