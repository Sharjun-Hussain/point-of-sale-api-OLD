const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('Main Category View'), categoryController.getAllMainCategories);
router.get('/active/list', categoryController.getActiveMainCategoriesList);
router.get('/list', categoryController.getActiveMainCategoriesList);
router.post('/', checkPermission('Main Category Create'), categoryController.createMainCategory);
router.put('/:id', checkPermission('Main Category Edit'), categoryController.updateMainCategory);

router.patch('/:id/activate', checkPermission('Main Category Edit'), (req, res, next) => {
    req.params.action = 'activate';
    categoryController.toggleMainStatus(req, res, next);
});
router.patch('/:id/deactivate', checkPermission('Main Category Edit'), (req, res, next) => {
    req.params.action = 'deactivate';
    categoryController.toggleMainStatus(req, res, next);
});
router.patch('/:id/:action', checkPermission('Main Category Edit'), categoryController.toggleMainStatus);

module.exports = router;
