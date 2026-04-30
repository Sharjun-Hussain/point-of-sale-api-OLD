const express = require('express');
const router = express.Router();

// Import sub-routes
const authRoutes = require('./auth');
const authController = require('../controllers/authController');
const authenticate = require('../middleware/auth');
const auditMiddleware = require('../middleware/auditLogger');
const upload = require('../middleware/upload');
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
const employeeRoutes = require('./employees');
const employeePerformanceRoutes = require('./employeePerformanceRoutes');
const reportRoutes = require('./reportRoutes');
const chequeRoutes = require('./cheques');
const accountRoutes = require('./accounts');
const stockRoutes = require('./stocks');
const maintenanceRoutes = require('./maintenance');
const shiftRoutes = require('./shifts');
const aiRoutes = require('./aiRoutes');

// Activate global audit logger for all non-GET mutations
router.use(auditMiddleware());

// Use routes
router.use('/auth', authRoutes);

// High-Density Identity Aliases (Direct root access for Frontend compatibility)
router.get('/me', authenticate, authController.me);
router.put('/me', authenticate, upload.single('profile_image'), authController.updateMe);

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
router.use('/employees', employeeRoutes);
router.use('/employee-performance', employeePerformanceRoutes);
router.use('/reports', reportRoutes);
router.use('/cheques', chequeRoutes);
router.use('/common', commonRoutes);
router.use('/maintenance', maintenanceRoutes);
router.use('/shifts', shiftRoutes);
router.use('/ai', aiRoutes);

module.exports = router;
