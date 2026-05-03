const express = require('express');
const router = express.Router();
const poController = require('../controllers/purchaseOrderController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const upload = require('../middleware/upload');

router.use(authenticate);

router.get('/', checkPermission('purchase:view'), poController.getAllPurchaseOrders);
router.post('/', checkPermission('purchase:create'), upload.array('attachmentFiles', 10), poController.createPurchaseOrder);
router.get('/:id', checkPermission('purchase:view'), poController.getPurchaseOrderById);
router.patch('/:id/approve', checkPermission('purchase:edit'), poController.approvePurchaseOrder);
router.patch('/:id/cancel', checkPermission('purchase:edit'), poController.cancelPurchaseOrder);
router.post('/:id/email', checkPermission('purchase:view'), poController.emailPurchaseOrder);
router.get('/:id/pdf', checkPermission('purchase:view'), poController.generatePOPDF);
router.put('/:id', checkPermission('purchase:edit'), poController.updatePurchaseOrder);
router.delete('/:id', checkPermission('purchase:delete'), poController.deletePurchaseOrder);

// Multi-file attachment management
router.post('/:id/attachments', checkPermission('purchase:edit'), upload.array('attachmentFiles', 10), poController.uploadPOAttachment);
router.delete('/:id/attachments/:attachmentId', checkPermission('purchase:edit'), poController.deletePOAttachment);

module.exports = router;
