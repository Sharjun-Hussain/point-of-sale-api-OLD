const db = require('../models');
const { AuditLog } = db;

/**
 * Centralized Audit Logging Service
 * Provides methods to log all user activities and system events
 */
class AuditService {
    /**
     * Generic log method
     * @param {Object} params - Audit log parameters
     */
    async log({
        organizationId,
        userId = null,
        action,
        entityType = null,
        entityId = null,
        description = null,
        oldValues = null,
        newValues = null,
        ipAddress = null,
        userAgent = null,
        status = 'success',
        errorMessage = null,
        metadata = null
    }) {
        try {
            await AuditLog.create({
                organization_id: organizationId,
                user_id: userId,
                action,
                entity_type: entityType,
                entity_id: entityId,
                description,
                old_values: oldValues,
                new_values: newValues,
                ip_address: ipAddress,
                user_agent: userAgent,
                status,
                error_message: errorMessage,
                metadata
            });
        } catch (error) {
            // Don't throw errors from audit logging to avoid breaking main operations
            console.error('Audit logging failed:', error);
        }
    }

    /**
     * Log user login
     */
    async logLogin(organizationId, userId, ipAddress, userAgent, success = true, errorMessage = null) {
        await this.log({
            organizationId,
            userId,
            action: 'LOGIN',
            entityType: 'User',
            entityId: userId,
            description: success ? 'User logged in successfully' : 'Failed login attempt',
            ipAddress,
            userAgent,
            status: success ? 'success' : 'failure',
            errorMessage
        });
    }

    /**
     * Log user logout
     */
    async logLogout(organizationId, userId, ipAddress, userAgent) {
        await this.log({
            organizationId,
            userId,
            action: 'LOGOUT',
            entityType: 'User',
            entityId: userId,
            description: 'User logged out',
            ipAddress,
            userAgent
        });
    }

    /**
     * Log entity creation
     */
    async logCreate(organizationId, userId, entityType, entityId, newValues, ipAddress, userAgent, metadata = null) {
        await this.log({
            organizationId,
            userId,
            action: 'CREATE',
            entityType,
            entityId,
            description: `Created ${entityType}`,
            newValues,
            ipAddress,
            userAgent,
            metadata
        });
    }

    /**
     * Log entity update
     */
    async logUpdate(organizationId, userId, entityType, entityId, oldValues, newValues, ipAddress, userAgent, metadata = null) {
        await this.log({
            organizationId,
            userId,
            action: 'UPDATE',
            entityType,
            entityId,
            description: `Updated ${entityType}`,
            oldValues,
            newValues,
            ipAddress,
            userAgent,
            metadata
        });
    }

    /**
     * Log entity deletion
     */
    async logDelete(organizationId, userId, entityType, entityId, oldValues, ipAddress, userAgent, metadata = null) {
        await this.log({
            organizationId,
            userId,
            action: 'DELETE',
            entityType,
            entityId,
            description: `Deleted ${entityType}`,
            oldValues,
            ipAddress,
            userAgent,
            metadata
        });
    }

    /**
     * Log failed operation
     */
    async logFailure(organizationId, userId, action, entityType, error, ipAddress, userAgent, metadata = null) {
        await this.log({
            organizationId,
            userId,
            action,
            entityType,
            description: `Failed to ${action.toLowerCase()} ${entityType}`,
            ipAddress,
            userAgent,
            status: 'failure',
            errorMessage: error.message || error.toString(),
            metadata
        });
    }

    /**
     * Log custom action
     */
    async logCustom(organizationId, userId, action, description, ipAddress, userAgent, metadata = null) {
        await this.log({
            organizationId,
            userId,
            action,
            description,
            ipAddress,
            userAgent,
            metadata
        });
    }

    /**
     * Extract IP address from request
     */
    getIpAddress(req) {
        return req.ip ||
            req.headers['x-forwarded-for']?.split(',')[0] ||
            req.headers['x-real-ip'] ||
            req.connection?.remoteAddress ||
            null;
    }

    /**
     * Extract user agent from request
     */
    getUserAgent(req) {
        return req.headers['user-agent'] || null;
    }

    /**
     * Get request context (IP + User Agent)
     */
    getRequestContext(req) {
        return {
            ipAddress: this.getIpAddress(req),
            userAgent: this.getUserAgent(req)
        };
    }
}

module.exports = new AuditService();
