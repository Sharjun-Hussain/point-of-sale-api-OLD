const express = require('express');
const router = express.Router();

// Import sub-routes
const authRoutes = require('./auth');
const userRoutes = require('./users');
const roleRoutes = require('./roles');
const organizationRoutes = require('./organizations');
const branchRoutes = require('./branches');
const productRoutes = require('./products');
const supplierRoutes = require('./suppliers');
const customerRoutes = require('./customers');
const purchaseOrderRoutes = require('./purchaseOrders');
const purchaseReturnRoutes = require('./purchaseReturns');
const brandRoutes = require('./brands');
const mainCategoryRoutes = require('./mainCategories');
const subCategoryRoutes = require('./subCategories');
const unitRoutes = require('./units');
const measurementUnitRoutes = require('./measurementUnits');
const containerRoutes = require('./containers');
const expenseRoutes = require('./expenses');
const expenseCategoryRoutes = require('./expenseCategories');
const settingRoutes = require('./settings');
const commonRoutes = require('./common');
const attributeRoutes = require('./attributes');
const salesRoutes = require('./sales');
const auditRoutes = require('./auditRoutes');
const employeePerformanceRoutes = require('./employeePerformanceRoutes');
const reportRoutes = require('./reportRoutes');
const chequeRoutes = require('./cheques');
const accountRoutes = require('./accounts');
const stockRoutes = require('./stocks');

// Use routes
router.use('/', authRoutes);
router.use('/stocks', stockRoutes);
router.use('/accounts', accountRoutes);
router.use('/organizations', organizationRoutes);
router.use('/branches', branchRoutes);
router.use('/roles', roleRoutes);
router.use('/users', userRoutes);
router.use('/main-categories', mainCategoryRoutes);
router.use('/sub-categories', subCategoryRoutes);
router.use('/brands', brandRoutes);
router.use('/units', unitRoutes);
router.use('/attributes', attributeRoutes); // Added attributeRoutes mount
router.use('/products', productRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/customers', customerRoutes);
router.use('/purchase-orders', purchaseOrderRoutes);
router.use('/purchase-returns', purchaseReturnRoutes);
router.use('/measurement-units', measurementUnitRoutes);
router.use('/containers', containerRoutes);
router.use('/expenses', expenseRoutes);
router.use('/expense-categories', expenseCategoryRoutes);
router.use('/settings', settingRoutes);
router.use('/sales', salesRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/employee-performance', employeePerformanceRoutes);
router.use('/reports', reportRoutes);
router.use('/cheques', chequeRoutes);
router.use('/common', commonRoutes);

module.exports = router;
