const express = require('express');
const router = express.Router();
const unitController = require('../controllers/unitController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('Unit View'), unitController.getAllMeasurementUnits);
router.get('/active/list', unitController.getActiveMeasurementUnitsList);
router.post('/', checkPermission('Unit Create'), unitController.createMeasurementUnit);
router.put('/:id', checkPermission('Unit Edit'), unitController.updateMeasurementUnit);

router.patch('/:id/activate', checkPermission('Unit Edit'), (req, res, next) => {
    req.params.action = 'activate';
    unitController.toggleMeasurementStatus(req, res, next);
});
router.patch('/:id/deactivate', checkPermission('Unit Edit'), (req, res, next) => {
    req.params.action = 'deactivate';
    unitController.toggleMeasurementStatus(req, res, next);
});
router.patch('/:id/:action', checkPermission('Unit Edit'), unitController.toggleMeasurementStatus);

module.exports = router;
