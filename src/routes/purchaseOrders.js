const express = require('express');
const router = express.Router();
const poController = require('../controllers/purchaseOrderController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('Purchase View'), poController.getAllPurchaseOrders);
router.post('/', checkPermission('Purchase Create'), poController.createPurchaseOrder);
router.get('/:id', checkPermission('Purchase View'), poController.getPurchaseOrderById);
router.patch('/:id/approve', checkPermission('Purchase Edit'), poController.approvePurchaseOrder);
router.get('/:id/pdf', checkPermission('Purchase View'), poController.generatePOPDF);
router.put('/:id', checkPermission('Purchase Edit'), poController.updatePurchaseOrder);
router.delete('/:id', checkPermission('Purchase Delete'), poController.deletePurchaseOrder);

module.exports = router;
