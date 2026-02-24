const express = require('express');
const router = express.Router();
const unitController = require('../controllers/unitController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('unit:view'), unitController.getAllUnits);
router.get('/active/list', unitController.getActiveUnitsList);
router.post('/', checkPermission('unit:create'), unitController.createUnit);
router.put('/:id', checkPermission('unit:edit'), unitController.updateUnit);

router.patch('/:id/activate', checkPermission('unit:edit'), (req, res, next) => {
    req.params.action = 'activate';
    unitController.toggleUnitStatus(req, res, next);
});
router.patch('/:id/deactivate', checkPermission('unit:edit'), (req, res, next) => {
    req.params.action = 'deactivate';
    unitController.toggleUnitStatus(req, res, next);
});
router.patch('/:id/:action', checkPermission('unit:edit'), unitController.toggleUnitStatus);

module.exports = router;
