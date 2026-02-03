const express = require('express');
const router = express.Router();
const unitController = require('../controllers/unitController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('Unit View'), unitController.getAllUnits);
router.get('/active/list', unitController.getActiveUnitsList);
router.post('/', checkPermission('Unit Create'), unitController.createUnit);
router.put('/:id', checkPermission('Unit Edit'), unitController.updateUnit);

router.patch('/:id/activate', checkPermission('Unit Edit'), (req, res, next) => {
    req.params.action = 'activate';
    unitController.toggleUnitStatus(req, res, next);
});
router.patch('/:id/deactivate', checkPermission('Unit Edit'), (req, res, next) => {
    req.params.action = 'deactivate';
    unitController.toggleUnitStatus(req, res, next);
});
router.patch('/:id/:action', checkPermission('Unit Edit'), unitController.toggleUnitStatus);

module.exports = router;
