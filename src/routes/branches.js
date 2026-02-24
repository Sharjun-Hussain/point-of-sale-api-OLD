const express = require('express');
const router = express.Router();
const orgController = require('../controllers/organizationController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('branch:view'), orgController.getAllBranches);
router.get('/active/list', orgController.getActiveBranchesList);
router.get('/:id', checkPermission('branch:view'), orgController.getBranchById); // Added by me
router.post('/', checkPermission('branch:create'), orgController.createBranch);
router.put('/:id', checkPermission('branch:edit'), orgController.updateBranch);

router.patch('/:id/activate', checkPermission('branch:edit'), (req, res, next) => {
    req.params.action = 'activate';
    orgController.toggleBranchStatus(req, res, next);
});
router.patch('/:id/deactivate', checkPermission('branch:edit'), (req, res, next) => {
    req.params.action = 'deactivate';
    orgController.toggleBranchStatus(req, res, next);
});
router.patch('/:id/:action', checkPermission('branch:edit'), orgController.toggleBranchStatus);

module.exports = router;
