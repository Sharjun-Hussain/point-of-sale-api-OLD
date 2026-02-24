const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('category:view'), categoryController.getAllSubCategories);
router.get('/active/list', categoryController.getActiveSubCategoriesList);
router.get('/list', categoryController.getActiveSubCategoriesList);
router.post('/', checkPermission('category:create'), categoryController.createSubCategory);
router.put('/:id', checkPermission('category:edit'), categoryController.updateSubCategory);

router.patch('/:id/activate', checkPermission('category:edit'), (req, res, next) => {
    req.params.action = 'activate';
    categoryController.toggleSubStatus(req, res, next);
});
router.patch('/:id/deactivate', checkPermission('category:edit'), (req, res, next) => {
    req.params.action = 'deactivate';
    categoryController.toggleSubStatus(req, res, next);
});
router.patch('/:id/:action', checkPermission('category:edit'), categoryController.toggleSubStatus);

module.exports = router;
