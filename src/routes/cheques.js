const express = require('express');
const router = express.Router();
const chequeController = require('../controllers/chequeController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('finance:view'), chequeController.getAllCheques);
router.get('/:id', checkPermission('finance:view'), chequeController.getChequeById);
router.post('/', checkPermission('finance:manage'), chequeController.createCheque);
router.patch('/:id/status', checkPermission('finance:manage'), chequeController.updateChequeStatus);
router.delete('/:id', checkPermission('finance:manage'), chequeController.deleteCheque);

module.exports = router;
