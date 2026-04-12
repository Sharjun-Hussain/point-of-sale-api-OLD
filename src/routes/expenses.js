const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const upload = require('../middleware/upload');

router.use(authenticate);

// Expense categories (Frontend might use different base for these sometimes)
router.get('/categories', checkPermission('expense:view'), expenseController.getAllExpenseCategories);
router.post('/categories', checkPermission('expense:create'), expenseController.createExpenseCategory);

// Expenses
router.get('/', checkPermission('expense:view'), expenseController.getAllExpenses);
router.post('/', checkPermission('expense:create'), upload.single('attachment'), expenseController.createExpense);
router.get('/:id', checkPermission('expense:view'), expenseController.getExpenseById);
router.put('/:id', checkPermission('expense:edit'), upload.single('attachment'), expenseController.updateExpense);
router.delete('/:id', checkPermission('expense:delete'), expenseController.deleteExpense);

module.exports = router;
