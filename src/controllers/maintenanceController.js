const maintenanceService = require('../services/maintenanceService');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const auditService = require('../services/auditService');
const fs = require('fs');

/**
 * MAINTENANCE CONTROLLER
 * Exposes system health and optimization tools to the Super Admin.
 */
class MaintenanceController {
    /**
     * Get real-time health and usage statistics for the database.
     */
    async getHealthStats(req, res, next) {
        try {
            const [dbStats, systemHealth] = await Promise.all([
                maintenanceService.getDatabaseStats(),
                maintenanceService.getSystemHealth()
            ]);

            return successResponse(res, {
                database: dbStats,
                system: systemHealth
            }, 'System health statistics fetched successfully.');
        } catch (error) { next(error); }
    }

    /**
     * Fetch historical telemetry for system charts.
     */
    async getTelemetry(req, res, next) {
        try {
            // Default to 60 minutes if not provided
            const minutes = parseInt(req.query.minutes) || 60;
            const history = await maintenanceService.getTelemetryHistory(minutes);
            
            return successResponse(res, history, 'Telemetry history fetched successfully.');
        } catch (error) { next(error); }
    }

    /**
     * Trigger a full database table optimization.
     */
    async optimizeDatabase(req, res, next) {
        try {
            const { ipAddress, userAgent } = auditService.getRequestContext(req);
            
            // Log the optimization attempt
            await auditService.logCustom(
                req.user.organization_id,
                req.user.id,
                'DB_OPTIMIZE',
                'Triggered manual database table optimization.',
                ipAddress,
                userAgent
            );

            const result = await maintenanceService.optimizeTables();
            return successResponse(res, result, 'Database optimization completed.');
        } catch (error) { next(error); }
    }

    /**
     * Clear application-level caches.
     */
    async purgeCache(req, res, next) {
        try {
            const result = await maintenanceService.clearAppCache();
            return successResponse(res, result, 'System cache purged successfully.');
        } catch (error) { next(error); }
    }

    /**
     * Export the full database as a SQL file.
     */
    async exportDatabase(req, res, next) {
        try {
            const { ipAddress, userAgent } = auditService.getRequestContext(req);
            await auditService.logCustom(req.user.organization_id, req.user.id, 'DB_EXPORT', 'Generated full SQL snapshot.', ipAddress, userAgent);

            const { filepath, filename } = await maintenanceService.exportSql();
            
            res.download(filepath, filename, (err) => {
                if (err) {
                    logger.error(`Download Error: ${err.message}`);
                }
                // Clean up the temporary backup file
                fs.unlink(filepath, (unlinkErr) => {
                    if (unlinkErr) logger.error(`Cleanup Error: ${unlinkErr.message}`);
                });
            });
        } catch (error) { next(error); }
    }

    /**
     * Import a SQL snapshot to restore the database.
     */
    async importDatabase(req, res, next) {
        try {
            if (!req.file) return errorResponse(res, 'No SQL snapshot provided.', 400);

            const { ipAddress, userAgent } = auditService.getRequestContext(req);
            await auditService.logCustom(req.user.organization_id, req.user.id, 'DB_IMPORT', 'Initiated structural restoration from SQL snapshot.', ipAddress, userAgent);

            const result = await maintenanceService.importSql(req.file.path);

            // Clean up the uploaded file
            fs.unlink(req.file.path, (err) => {
                if (err) logger.error(`Upload Cleanup Error: ${err.message}`);
            });

            return successResponse(res, result, 'Structural restoration finalized.');
        } catch (error) { next(error); }
    }
}

module.exports = new MaintenanceController();
