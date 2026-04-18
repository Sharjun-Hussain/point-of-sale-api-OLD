const express = require('express');
const router = express.Router();
const maintenanceController = require('../controllers/maintenanceController');
const authenticate = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Dedicated storage for DB backups (temporary)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/backups';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `import-${Date.now()}.sql`);
    }
});
const upload = multer({ storage });

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

/**
 * @route GET /api/v1/maintenance/db/export
 * @desc Generate a full MySQL dump (Super Admin Only)
 */
router.get('/db/export', checkPermission('system:maintenance'), maintenanceController.exportDatabase);

/**
 * @route POST /api/v1/maintenance/db/import
 * @desc Restore database from a SQL snapshot (Super Admin Only)
 */
router.post('/db/import', checkPermission('system:maintenance'), upload.single('sql'), maintenanceController.importDatabase);

module.exports = router;
