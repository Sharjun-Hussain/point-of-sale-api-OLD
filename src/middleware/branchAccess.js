/**
 * Branch Access Middleware
 * Ensures users can only access data from their assigned branches
 */
const checkBranchAccess = (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required'
            });
        }

        // Check if user has cross-branch access permission
        const userPermissions = [];

        if (req.user.roles && req.user.roles.length > 0) {
            // Super Admin bypass
            const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');
            if (isSuperAdmin) {
                req.allowAllBranches = true;
                return next();
            }

            req.user.roles.forEach(role => {
                if (role.permissions && role.permissions.length > 0) {
                    role.permissions.forEach(permission => {
                        userPermissions.push(permission.name);
                    });
                }
            });
        }

        // If user has cross-branch access, allow all branches
        if (userPermissions.includes('Cross Branch Access')) {
            req.allowAllBranches = true;
            return next();
        }

        // Otherwise, restrict to user's assigned branches
        req.allowAllBranches = false;
        req.userBranches = req.user.branches || [];

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Add branch filter to query
 * Call this in controllers to filter data by branch
 */
const applyBranchFilter = (req, whereClause = {}) => {
    if (req.allowAllBranches) {
        return whereClause;
    }

    const branchIds = req.userBranches.map(b => b.id);

    if (branchIds.length === 0) {
        // User has no branches assigned, return empty result
        return {
            ...whereClause,
            branch_id: null
        };
    }

    return {
        ...whereClause,
        branch_id: branchIds
    };
};

module.exports = {
    checkBranchAccess,
    applyBranchFilter
};
