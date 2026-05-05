const express = require('express');
const router = express.Router();
const distributorController = require('../controllers/distributorController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('customer:view'), distributorController.getAllDistributors);
router.get('/active/list', checkPermission('customer:view'), distributorController.getActiveDistributorsList);
router.get('/:id', checkPermission('customer:view'), distributorController.getDistributorById);
router.get('/:id/ledger', checkPermission('finance:view'), distributorController.getDistributorLedger);
router.get('/:id/purchased-items', checkPermission('customer:view'), distributorController.getDistributorPurchasedItems);

router.post('/', checkPermission('customer:create'), distributorController.createDistributor);
router.post('/:id/payments', checkPermission('finance:manage'), distributorController.createDistributorPayment);

router.put('/:id', checkPermission('customer:edit'), distributorController.updateDistributor);

router.delete('/:id', checkPermission('customer:delete'), distributorController.deleteDistributor);

module.exports = router;
