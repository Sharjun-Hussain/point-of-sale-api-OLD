const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('customer:view'), customerController.getAllCustomers);
router.get('/active/list', checkPermission('customer:view'), customerController.getActiveCustomersList);
router.get('/:id', checkPermission('customer:view'), customerController.getCustomerById);
router.get('/:id/ledger', checkPermission('finance:view'), customerController.getCustomerLedger);

router.post('/', checkPermission('customer:create'), customerController.createCustomer);
router.post('/:id/payments', checkPermission('finance:manage'), customerController.createCustomerPayment);

router.put('/:id', checkPermission('customer:edit'), customerController.updateCustomer);

router.delete('/:id', checkPermission('customer:delete'), customerController.deleteCustomer);

module.exports = router;
