const maintenanceService = require('../services/maintenanceService');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const auditService = require('../services/auditService');

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
}

module.exports = new MaintenanceController();
