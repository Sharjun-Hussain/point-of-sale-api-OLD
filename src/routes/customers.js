const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('Customer View'), customerController.getAllCustomers);
router.get('/active/list', checkPermission('Customer View'), customerController.getActiveCustomersList);
router.get('/:id', checkPermission('Customer View'), customerController.getCustomerById);
router.get('/:id/ledger', checkPermission('Accounting View'), customerController.getCustomerLedger);

router.post('/', checkPermission('Customer Create'), customerController.createCustomer);
router.post('/:id/payments', checkPermission('Accounting View'), customerController.createCustomerPayment);

router.put('/:id', checkPermission('Customer Edit'), customerController.updateCustomer);

router.delete('/:id', checkPermission('Customer Delete'), customerController.deleteCustomer);

module.exports = router;
