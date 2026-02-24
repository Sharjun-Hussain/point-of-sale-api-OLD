const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('expense:view'), expenseController.getAllExpenseCategories);
router.post('/', checkPermission('expense:create'), expenseController.createExpenseCategory);

module.exports = router;
