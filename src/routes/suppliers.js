const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplierController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const upload = require('../middleware/upload');

router.use(authenticate);

router.get('/', checkPermission('Supplier View'), supplierController.getAllSuppliers);
router.get('/active/list', checkPermission('Supplier View'), supplierController.getActiveSuppliersList);
router.get('/grn', checkPermission('Purchase View'), supplierController.getGRNList);
router.get('/grn/:id', checkPermission('Purchase View'), supplierController.getGRNDetail);
router.get('/grn/:id/pdf', checkPermission('Purchase View'), supplierController.generateGRNPDF);
router.get('/:id', checkPermission('Supplier View'), supplierController.getSupplierById);
router.get('/:id/ledger', checkPermission('Accounting View'), supplierController.getSupplierLedger);

router.post('/', checkPermission('Supplier Create'), upload.none(), supplierController.createSupplier);
router.post('/grn', checkPermission('Purchase Create'), upload.single('invoiceFile'), supplierController.createGRN);
router.post('/:id/payments', checkPermission('Accounting Create'), supplierController.createSupplierPayment);

router.put('/:id', checkPermission('Supplier Edit'), upload.none(), supplierController.updateSupplier);

router.delete('/:id', checkPermission('Supplier Delete'), supplierController.deleteSupplier);

module.exports = router;
