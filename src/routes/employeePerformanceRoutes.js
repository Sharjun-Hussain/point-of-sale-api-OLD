const express = require('express');
const router = express.Router();
const employeePerformanceController = require('../controllers/employeePerformanceController');
const authenticate = require('../middleware/auth');

router.use(authenticate);

/**
 * @route   GET /api/v1/employee-performance
 * @desc    Get employee performance metrics for leaderboard/dashboard
 * @access  Authenticated users
 */
router.get('/', employeePerformanceController.getEmployeePerformance);

module.exports = router;
