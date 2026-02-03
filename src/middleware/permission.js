/**
 * Permission Middleware
 * Checks if user has required permission
 */
const checkPermission = (requiredPermission) => {
    return (req, res, next) => {
        try {
            // User should be attached by auth middleware
            if (!req.user) {
                return res.status(401).json({
                    status: 'error',
                    message: 'Authentication required'
                });
            }

            // Get all permissions from user's roles
            const userPermissions = [];

            if (req.user.roles && req.user.roles.length > 0) {
                // Super Admin bypass
                const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');
                if (isSuperAdmin) return next();

                req.user.roles.forEach(role => {
                    if (role.permissions && role.permissions.length > 0) {
                        role.permissions.forEach(permission => {
                            if (!userPermissions.includes(permission.name)) {
                                userPermissions.push(permission.name);
                            }
                        });
                    }
                });
            }

            // Check if user has required permission
            if (!userPermissions.includes(requiredPermission)) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Insufficient permissions'
                });
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};

/**
 * Check if user has any of the required permissions
 */
const checkAnyPermission = (permissions = []) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    status: 'error',
                    message: 'Authentication required'
                });
            }

            const userPermissions = [];

            if (req.user.roles && req.user.roles.length > 0) {
                // Super Admin bypass
                const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');
                if (isSuperAdmin) return next();

                req.user.roles.forEach(role => {
                    if (role.permissions && role.permissions.length > 0) {
                        role.permissions.forEach(permission => {
                            if (!userPermissions.includes(permission.name)) {
                                userPermissions.push(permission.name);
                            }
                        });
                    }
                });
            }

            // Check if user has any of the required permissions
            const hasPermission = permissions.some(perm => userPermissions.includes(perm));

            if (!hasPermission) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Insufficient permissions'
                });
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};

module.exports = {
    checkPermission,
    checkAnyPermission
};
