const auditService = require('../services/auditService');

/**
 * Middleware to automatically log HTTP requests
 * This provides a baseline audit trail for all API calls
 */
const auditMiddleware = (options = {}) => {
    const {
        excludePaths = ['/api/v1/health', '/api/v1/audit-logs'], // Don't log these paths
        excludeMethods = ['GET'], // Don't log GET requests by default (too verbose)
        logGetRequests = false // Set to true to log GET requests
    } = options;

    return async (req, res, next) => {
        // Skip if path is excluded
        if (excludePaths.some(path => req.path.startsWith(path))) {
            return next();
        }

        // Skip GET requests unless explicitly enabled
        if (req.method === 'GET' && !logGetRequests && excludeMethods.includes('GET')) {
            return next();
        }

        // Capture response
        const originalSend = res.send;
        let responseBody;

        res.send = function (data) {
            responseBody = data;
            originalSend.call(this, data);
        };

        // Wait for response to complete
        res.on('finish', async () => {
            try {
                // Only log if user is authenticated
                if (!req.user) {
                    return;
                }

                const { ipAddress, userAgent } = auditService.getRequestContext(req);

                // Determine action from HTTP method
                const actionMap = {
                    'POST': 'CREATE',
                    'PUT': 'UPDATE',
                    'PATCH': 'UPDATE',
                    'DELETE': 'DELETE',
                    'GET': 'READ'
                };

                const action = actionMap[req.method] || req.method;

                // Extract entity type from path (e.g., /api/v1/products -> Product)
                const pathParts = req.path.split('/').filter(Boolean);
                let entityType = null;
                if (pathParts.length >= 3) {
                    entityType = pathParts[2]
                        .replace(/-/g, ' ')
                        .replace(/\b\w/g, l => l.toUpperCase())
                        .replace(/ /g, '');
                    // Remove plural 's' if present
                    if (entityType.endsWith('s') && !entityType.endsWith('ss')) {
                        entityType = entityType.slice(0, -1);
                    }
                }

                // Extract entity ID from path or body
                let entityId = null;
                if (pathParts.length >= 4 && pathParts[3].match(/^[0-9a-f-]{36}$/i)) {
                    entityId = pathParts[3];
                } else if (req.body?.id) {
                    entityId = req.body.id;
                }

                // Determine status
                const status = res.statusCode < 400 ? 'success' : 'failure';

                // Build description
                let description = `${action} ${entityType || 'resource'}`;
                if (entityId) {
                    description += ` (ID: ${entityId})`;
                }

                // Log the audit entry
                await auditService.log({
                    organizationId: req.user.organization_id,
                    userId: req.user.id,
                    action,
                    entityType,
                    entityId,
                    description,
                    newValues: req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' ? req.body : null,
                    ipAddress,
                    userAgent,
                    status,
                    errorMessage: status === 'failure' ? responseBody : null,
                    metadata: {
                        method: req.method,
                        path: req.path,
                        statusCode: res.statusCode,
                        query: req.query
                    }
                });
            } catch (error) {
                // Don't throw errors from audit logging
                console.error('Audit middleware error:', error);
            }
        });

        next();
    };
};

module.exports = auditMiddleware;
