const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', accountController.getAllAccounts);
router.post('/', accountController.createAccount);
router.put('/:id', accountController.updateAccount);
router.get('/:id/ledger', accountController.getAccountLedger);
router.post('/:id/opening-balance', accountController.setOpeningBalance);
router.post('/transfer', accountController.transferFunds);
router.post('/journal', accountController.createJournalEntry);

module.exports = router;
