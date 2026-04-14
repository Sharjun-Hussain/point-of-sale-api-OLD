const express = require('express');
const router = express.Router();
const maintenanceController = require('../controllers/maintenanceController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

/**
 * MAINTENANCE ROUTES
 * Strictly protected system-level operations.
 */

// All routes here require authentication
router.use(authenticate);

/**
 * @route GET /api/v1/maintenance/stats
 * @desc Fetch system health and database statistics (Super Admin Only)
 */
router.get('/stats', checkPermission('system:maintenance'), maintenanceController.getHealthStats);

/**
 * @route GET /api/v1/maintenance/telemetry
 * @desc Fetch historical system telemetry for charts (Super Admin Only)
 */
router.get('/telemetry', checkPermission('system:maintenance'), maintenanceController.getTelemetry);

/**
 * @route POST /api/v1/maintenance/optimize
 * @desc Trigger manual database table optimization (Super Admin Only)
 */
router.post('/optimize', checkPermission('system:maintenance'), maintenanceController.optimizeDatabase);

/**
 * @route POST /api/v1/maintenance/clear-cache
 * @desc Clear application-level memory caches (Super Admin Only)
 */
router.post('/clear-cache', checkPermission('system:maintenance'), maintenanceController.purgeCache);

module.exports = router;
