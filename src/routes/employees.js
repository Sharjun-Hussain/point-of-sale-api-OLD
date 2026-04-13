const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const upload = require('../middleware/upload');

router.use(authenticate);

/**
 * @route   GET /api/v1/employees
 * @desc    Get all employees for the organization
 * @access  employee:view
 */
router.get('/', checkPermission('employee:view', 'user:view'), employeeController.getAllEmployees);

/**
 * @route   GET /api/v1/employees/:id
 * @desc    Get employee details by ID
 * @access  employee:view
 */
router.get('/:id', checkPermission('employee:view', 'user:view'), employeeController.getEmployeeById);

/**
 * @route   POST /api/v1/employees
 * @desc    Create a new employee (Atomic creation)
 * @access  employee:create
 */
router.post('/', checkPermission('employee:create', 'user:create'), upload.single('profile_image'), employeeController.createEmployee);

/**
 * @route   PUT /api/v1/employees/:id
 * @desc    Update employee profile
 * @access  employee:edit
 */
router.patch('/:id', checkPermission('employee:edit', 'user:edit'), upload.single('profile_image'), employeeController.updateEmployee);

/**
 * @route   PATCH /api/v1/employees/:id/toggle-status
 * @desc    Toggle employee activation status
 * @access  employee:edit
 */
router.patch('/:id/toggle-status', checkPermission('employee:edit', 'user:edit'), employeeController.toggleStatus);

/**
 * @route   PATCH /api/v1/employees/:id/toggle-access
 * @desc    Toggle employee login access
 * @access  employee:edit
 */
router.patch('/:id/toggle-access', checkPermission('employee:edit', 'user:edit'), employeeController.toggleLoginAccess);

/**
 * @route   DELETE /api/v1/employees/:id
 * @desc    Delete employee record and linked user access
 * @access  employee:delete
 */
router.delete('/:id', checkPermission('employee:delete', 'user:delete'), employeeController.deleteEmployee);

module.exports = router;
