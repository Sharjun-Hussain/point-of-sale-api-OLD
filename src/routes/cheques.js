const express = require('express');
const router = express.Router();
const chequeController = require('../controllers/chequeController');
const authenticate = require('../middleware/auth');

router.use(authenticate);

router.get('/', chequeController.getAllCheques);
router.get('/:id', chequeController.getChequeById);
router.post('/', chequeController.createCheque);
router.patch('/:id/status', chequeController.updateChequeStatus);
router.delete('/:id', chequeController.deleteCheque);

module.exports = router;
