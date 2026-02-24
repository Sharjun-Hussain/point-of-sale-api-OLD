const express = require('express');
const router = express.Router();
const containerController = require('../controllers/containerController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('unit:view'), containerController.getAllContainers);
router.get('/active/list', containerController.getActiveContainersList);
router.get('/:id', checkPermission('unit:view'), containerController.getContainerById);
router.post('/', checkPermission('unit:create'), containerController.createContainer);
router.put('/:id', checkPermission('unit:edit'), containerController.updateContainer);
router.patch('/:id', checkPermission('unit:edit'), containerController.updateContainer);


router.patch('/:id/activate', checkPermission('unit:edit'), (req, res, next) => {
    req.params.action = 'activate';
    containerController.toggleStatus(req, res, next);
});
router.patch('/:id/deactivate', checkPermission('unit:edit'), (req, res, next) => {
    req.params.action = 'deactivate';
    containerController.toggleStatus(req, res, next);
});
router.patch('/:id/:action', checkPermission('unit:edit'), containerController.toggleStatus);

module.exports = router;
