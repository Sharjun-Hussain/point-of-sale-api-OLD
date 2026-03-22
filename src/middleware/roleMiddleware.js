/**
 * Role Middleware
 * Checks if user has one of the required roles
 */
const roleMiddleware = (allowedRoles = []) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    status: 'error',
                    message: 'Authentication required'
                });
            }

            const hasRole = req.user.roles && req.user.roles.some(role => allowedRoles.includes(role.name));

            if (!hasRole) {
                return res.status(403).json({
                    status: 'error',
                    message: `Access denied. Requires one of these roles: ${allowedRoles.join(', ')}`
                });
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};

module.exports = roleMiddleware;
