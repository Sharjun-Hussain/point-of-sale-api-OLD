const express = require('express');
const router = express.Router();
const shiftController = require('../controllers/shiftController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

const checkModule = require('../middleware/checkModule');

router.use(authenticate);
router.use(checkModule('shift_management'));

// Shift operations (Cashiers)
router.post('/open', checkPermission('shift:create'), shiftController.openShift);
router.get('/active', shiftController.getActiveShift);
router.post('/:shift_id/transactions', checkPermission('shift:manage'), shiftController.addTransaction);
router.post('/:shift_id/close', checkPermission('shift:manage'), shiftController.closeShift);

module.exports = router;
