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

            // Check if user has required permission (including wildcards)
            const hasDirectPermission = userPermissions.includes(requiredPermission);
            const hasWildcardPermission = userPermissions.some(perm => {
                if (perm === '*') return true;
                if (perm.endsWith(':*')) {
                    const module = perm.split(':')[0];
                    return requiredPermission.startsWith(`${module}:`);
                }
                return false;
            });

            if (!hasDirectPermission && !hasWildcardPermission) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access Denied: You do not have the required authority to perform this action.'
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

            // Check if user has any of the required permissions (including wildcards)
            const hasPermission = permissions.some(requiredPermission => {
                const hasDirect = userPermissions.includes(requiredPermission);
                const hasWildcard = userPermissions.some(perm => {
                    if (perm === '*') return true;
                    if (perm.endsWith(':*')) {
                        const module = perm.split(':')[0];
                        return requiredPermission.startsWith(`${module}:`);
                    }
                    return false;
                });
                return hasDirect || hasWildcard;
            });

            if (!hasPermission) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access Denied: You do not have the required authority to perform this action.'
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
