const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplierController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const upload = require('../middleware/upload');

router.use(authenticate);

router.get('/', checkPermission('supplier:view'), supplierController.getAllSuppliers);
router.get('/active/list', checkPermission('supplier:view'), supplierController.getActiveSuppliersList);
router.get('/grn', checkPermission('purchase:view'), supplierController.getGRNList);
router.get('/grn/:id', checkPermission('purchase:view'), supplierController.getGRNDetail);
router.get('/grn/:id/pdf', checkPermission('purchase:view'), supplierController.generateGRNPDF);
router.get('/:id', checkPermission('supplier:view'), supplierController.getSupplierById);
router.get('/:id/ledger', checkPermission('finance:view'), supplierController.getSupplierLedger);

router.post('/', checkPermission('supplier:create'), upload.none(), supplierController.createSupplier);
router.post('/grn', checkPermission('purchase:create'), upload.single('invoiceFile'), supplierController.createGRN);
router.post('/:id/payments', checkPermission('finance:manage'), supplierController.createSupplierPayment);

router.put('/:id', checkPermission('supplier:edit'), upload.none(), supplierController.updateSupplier);

router.delete('/:id', checkPermission('supplier:delete'), supplierController.deleteSupplier);

module.exports = router;
