const express = require('express');
const router = express.Router();
const containerController = require('../controllers/containerController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('Container View'), containerController.getAllContainers);
router.get('/active/list', containerController.getActiveContainersList);
router.get('/:id', checkPermission('Container View'), containerController.getContainerById);
router.post('/', checkPermission('Container Create'), containerController.createContainer);
router.put('/:id', checkPermission('Container Edit'), containerController.updateContainer);
router.patch('/:id', checkPermission('Container Edit'), containerController.updateContainer);


router.patch('/:id/activate', checkPermission('Container Edit'), (req, res, next) => {
    req.params.action = 'activate';
    containerController.toggleStatus(req, res, next);
});
router.patch('/:id/deactivate', checkPermission('Container Edit'), (req, res, next) => {
    req.params.action = 'deactivate';
    containerController.toggleStatus(req, res, next);
});
router.patch('/:id/:action', checkPermission('Container Edit'), containerController.toggleStatus);

module.exports = router;
