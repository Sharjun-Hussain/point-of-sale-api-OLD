const express = require('express');
const router = express.Router();
const purchaseReturnController = require('../controllers/purchaseReturnController');
const authenticate = require('../middleware/auth');

router.use(authenticate);

router.get('/', purchaseReturnController.getAllPurchaseReturns);
router.get('/:id', purchaseReturnController.getPurchaseReturnById);
router.post('/', purchaseReturnController.createPurchaseReturn);

module.exports = router;
