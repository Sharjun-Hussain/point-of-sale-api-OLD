const express = require('express');
const router = express.Router();
const poController = require('../controllers/purchaseOrderController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('purchase:view'), poController.getAllPurchaseOrders);
router.post('/', checkPermission('purchase:create'), poController.createPurchaseOrder);
router.get('/:id', checkPermission('purchase:view'), poController.getPurchaseOrderById);
router.patch('/:id/approve', checkPermission('purchase:edit'), poController.approvePurchaseOrder);
router.get('/:id/pdf', checkPermission('purchase:view'), poController.generatePOPDF);
router.put('/:id', checkPermission('purchase:edit'), poController.updatePurchaseOrder);
router.delete('/:id', checkPermission('purchase:delete'), poController.deletePurchaseOrder);

module.exports = router;
