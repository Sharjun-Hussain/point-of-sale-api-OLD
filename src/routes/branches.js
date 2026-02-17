const express = require('express');
const router = express.Router();
const orgController = require('../controllers/organizationController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('Branch View'), orgController.getAllBranches);
router.get('/active/list', orgController.getActiveBranchesList);
router.get('/:id', checkPermission('Branch View'), orgController.getBranchById); // Added by me
router.post('/', checkPermission('Branch Create'), orgController.createBranch);
router.put('/:id', checkPermission('Branch Edit'), orgController.updateBranch);

router.patch('/:id/activate', checkPermission('Branch Edit'), (req, res, next) => {
    req.params.action = 'activate';
    orgController.toggleBranchStatus(req, res, next);
});
router.patch('/:id/deactivate', checkPermission('Branch Edit'), (req, res, next) => {
    req.params.action = 'deactivate';
    orgController.toggleBranchStatus(req, res, next);
});
router.patch('/:id/:action', checkPermission('Branch Edit'), orgController.toggleBranchStatus);

module.exports = router;
