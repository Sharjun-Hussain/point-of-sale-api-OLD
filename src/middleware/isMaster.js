/**
 * Middleware to check if the user belongs to the Master Organization
 * This is used for system-level administrative routes (Plans, Organizations Management, etc.)
 */
const isMaster = (req, res, next) => {
    if (!req.user || !req.user.organization) {
        return res.status(403).json({
            status: 'error',
            message: 'Access Denied: Organization context missing.'
        });
    }

    // Check if the organization is marked as master
    if (req.user.organization.is_master !== true) {
        return res.status(403).json({
            status: 'error',
            message: 'Access Denied: This operation is restricted to the Master Organization only.'
        });
    }

    next();
};

module.exports = isMaster;
