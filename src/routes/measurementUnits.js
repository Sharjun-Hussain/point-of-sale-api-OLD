const express = require('express');
const router = express.Router();
const unitController = require('../controllers/unitController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('unit:view'), unitController.getAllMeasurementUnits);
router.get('/active/list', unitController.getActiveMeasurementUnitsList);
router.post('/', checkPermission('unit:create'), unitController.createMeasurementUnit);
router.put('/:id', checkPermission('unit:edit'), unitController.updateMeasurementUnit);

router.patch('/:id/activate', checkPermission('unit:edit'), (req, res, next) => {
    req.params.action = 'activate';
    unitController.toggleMeasurementStatus(req, res, next);
});
router.patch('/:id/deactivate', checkPermission('unit:edit'), (req, res, next) => {
    req.params.action = 'deactivate';
    unitController.toggleMeasurementStatus(req, res, next);
});
router.patch('/:id/:action', checkPermission('unit:edit'), unitController.toggleMeasurementStatus);

module.exports = router;
