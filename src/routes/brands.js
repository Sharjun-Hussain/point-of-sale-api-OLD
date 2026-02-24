const express = require('express');
const router = express.Router();
const brandController = require('../controllers/brandController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('brand:view'), brandController.getAllBrands);
router.get('/active/list', brandController.getActiveBrandsList);
router.post('/', checkPermission('brand:create'), brandController.createBrand);
router.put('/:id', checkPermission('brand:edit'), brandController.updateBrand);
router.delete('/:id', checkPermission('brand:delete'), brandController.deleteBrand);

// Status toggles
router.patch('/:id/activate', checkPermission('brand:edit'), (req, res, next) => {
    req.params.action = 'activate';
    brandController.toggleStatus(req, res, next);
});
router.patch('/:id/deactivate', checkPermission('brand:edit'), (req, res, next) => {
    req.params.action = 'deactivate';
    brandController.toggleStatus(req, res, next);
});
router.patch('/:id/:action', checkPermission('brand:edit'), brandController.toggleStatus);

module.exports = router;
