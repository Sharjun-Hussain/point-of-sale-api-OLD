const express = require('express');
const router = express.Router();
const brandController = require('../controllers/brandController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('Brand View'), brandController.getAllBrands);
router.get('/active/list', brandController.getActiveBrandsList);
router.post('/', checkPermission('Brand Create'), brandController.createBrand);
router.put('/:id', checkPermission('Brand Edit'), brandController.updateBrand);
router.delete('/:id', checkPermission('Brand Delete'), brandController.deleteBrand);

// Status toggles
router.patch('/:id/activate', checkPermission('Brand Edit'), (req, res, next) => {
    req.params.action = 'activate';
    brandController.toggleStatus(req, res, next);
});
router.patch('/:id/deactivate', checkPermission('Brand Edit'), (req, res, next) => {
    req.params.action = 'deactivate';
    brandController.toggleStatus(req, res, next);
});
router.patch('/:id/:action', checkPermission('Brand Edit'), brandController.toggleStatus);

module.exports = router;
