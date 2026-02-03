const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticate);

// Expense categories (Frontend might use different base for these sometimes)
router.get('/categories', checkPermission('Expense View'), expenseController.getAllExpenseCategories);
router.post('/categories', checkPermission('Expense Create'), expenseController.createExpenseCategory);

// Expenses
router.get('/', checkPermission('Expense View'), expenseController.getAllExpenses);
router.post('/', checkPermission('Expense Create'), expenseController.createExpense);
router.put('/:id', checkPermission('Expense Edit'), expenseController.updateExpense);
router.delete('/:id', checkPermission('Expense Delete'), expenseController.deleteExpense);

module.exports = router;
