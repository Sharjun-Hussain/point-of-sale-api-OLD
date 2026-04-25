const express = require('express');
const router = express.Router();
const shiftController = require('../controllers/shiftController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

// Shift operations (Cashiers)
router.post('/open', checkPermission('shift:create'), shiftController.openShift);
router.get('/active', shiftController.getActiveShift);
router.post('/:shift_id/transactions', checkPermission('shift:manage'), shiftController.addTransaction);
router.post('/:shift_id/close', checkPermission('shift:manage'), shiftController.closeShift);

module.exports = router;
