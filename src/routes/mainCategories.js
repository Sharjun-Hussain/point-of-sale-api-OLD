const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('category:view'), categoryController.getAllMainCategories);
router.get('/active/list', categoryController.getActiveMainCategoriesList);
router.get('/list', categoryController.getActiveMainCategoriesList);
router.post('/', checkPermission('category:create'), categoryController.createMainCategory);
router.put('/:id', checkPermission('category:edit'), categoryController.updateMainCategory);

router.patch('/:id/activate', checkPermission('category:edit'), (req, res, next) => {
    req.params.action = 'activate';
    categoryController.toggleMainStatus(req, res, next);
});
router.patch('/:id/deactivate', checkPermission('category:edit'), (req, res, next) => {
    req.params.action = 'deactivate';
    categoryController.toggleMainStatus(req, res, next);
});
router.patch('/:id/:action', checkPermission('category:edit'), categoryController.toggleMainStatus);

module.exports = router;
