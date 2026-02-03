const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

router.get('/', checkPermission('Expense View'), expenseController.getAllExpenseCategories);
router.post('/', checkPermission('Expense Create'), expenseController.createExpenseCategory);

module.exports = router;
