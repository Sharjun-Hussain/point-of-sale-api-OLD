/**
 * Branch Access Middleware
 * Ensures users can only access data from their assigned branches
 */
const checkBranchAccess = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Authentication required'
            });
        }

        // Check if user has cross-branch access permission
        let hasCrossBranchAccess = false;
        if (req.user.roles && req.user.roles.length > 0) {
            // Super Admin bypass
            const isSuperAdmin = req.user.roles.some(role => role.name === 'Super Admin');
            if (isSuperAdmin) {
                hasCrossBranchAccess = true;
                req.allowAllBranches = true;
            } else {
                req.user.roles.forEach(role => {
                    if (role.permissions && role.permissions.length > 0) {
                        const hasPermission = role.permissions.some(p => p.name === 'Cross Branch Access');
                        if (hasPermission) hasCrossBranchAccess = true;
                    }
                });
            }
        }

        if (hasCrossBranchAccess) {
            req.allowAllBranches = true;
        }

        const branchId = req.headers['x-branch-id'];

        // Settle the Branch ID
        if (branchId) {
            // 1. Explicit Branch Request
            // Validate if user belongs to this branch OR has cross-branch access
            const hasAccess = hasCrossBranchAccess || (req.user.branches && req.user.branches.some(b => b.id === branchId));

            if (!hasAccess) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access to this branch denied'
                });
            }

            req.branchId = branchId;

        } else {
            // 2. Default to Main Branch
            const mainBranch = await Branch.findOne({
                where: {
                    organization_id: req.user.organization_id,
                    is_main: true
                }
            });

            if (mainBranch) {
                req.branchId = mainBranch.id;
            } else {
                // Fallback: If no main branch needed but none found? 
                // For now, let's try to grab the first active branch they have access to
                if (req.user.branches && req.user.branches.length > 0) {
                    req.branchId = req.user.branches[0].id;
                } else {
                    // As a last resort, if they are super admin but didn't send a header and no main branch exists
                    // We might just leave req.branchId undefined, but that might break controllers expecting it.
                    // However, for single-tenant multi-branch, there SHOULD be a main branch.

                    // If we are strictly enforcing branch context:
                    /*
                    return res.status(400).json({
                       status: 'error',
                       message: 'No branch context could be established (No Main Branch found)'
                    });
                    */
                }
            }
        }

        // Allow all branches flag is already set above
        // req.userBranches is used by applyBranchFilter
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
