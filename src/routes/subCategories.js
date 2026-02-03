const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('Sub Category View'), categoryController.getAllSubCategories);
router.get('/active/list', categoryController.getActiveSubCategoriesList);
router.get('/list', categoryController.getActiveSubCategoriesList);
router.post('/', checkPermission('Sub Category Create'), categoryController.createSubCategory);
router.put('/:id', checkPermission('Sub Category Edit'), categoryController.updateSubCategory);

router.patch('/:id/activate', checkPermission('Sub Category Edit'), (req, res, next) => {
    req.params.action = 'activate';
    categoryController.toggleSubStatus(req, res, next);
});
router.patch('/:id/deactivate', checkPermission('Sub Category Edit'), (req, res, next) => {
    req.params.action = 'deactivate';
    categoryController.toggleSubStatus(req, res, next);
});
router.patch('/:id/:action', checkPermission('Sub Category Edit'), categoryController.toggleSubStatus);

module.exports = router;
