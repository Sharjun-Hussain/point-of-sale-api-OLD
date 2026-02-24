const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(auth);

router.get('/', checkPermission('finance:view'), accountController.getAllAccounts);
router.post('/', checkPermission('finance:manage'), accountController.createAccount);
router.put('/:id', checkPermission('finance:manage'), accountController.updateAccount);
router.get('/:id/ledger', checkPermission('finance:view'), accountController.getAccountLedger);
router.post('/:id/opening-balance', checkPermission('finance:manage'), accountController.setOpeningBalance);
router.post('/transfer', checkPermission('finance:manage'), accountController.transferFunds);
router.post('/journal', checkPermission('finance:manage'), accountController.createJournalEntry);

module.exports = router;
