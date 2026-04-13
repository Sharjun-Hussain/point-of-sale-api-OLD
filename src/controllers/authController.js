const { User, Role, Permission, Branch, RefreshToken, Employee, Organization } = require('../models');
const { hashPassword, comparePassword } = require('../utils/passwordHelper');
const { generateAccessToken, generateRefreshToken, verifyToken, decodeToken } = require('../utils/jwtHelper');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const auditService = require('../services/auditService');

/**
 * Auth Controller
 */
const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        // Find user
        const user = await User.findOne({
            where: { email },
            include: [
                {
                    model: Role,
                    as: 'roles',
                    include: [{ model: Permission, as: 'permissions' }]
                },
                {
                    model: Branch,
                    as: 'branches'
                },
                {
                    model: Employee,
                    as: 'employee',
                    include: [{ model: Branch, as: 'branches' }]
                },
                {
                    model: Organization,
                    as: 'organization',
                    attributes: ['id', 'name', 'logo']
                }
            ]
        });

        if (!user) {
            // Log failed login attempt
            await auditService.logLogin(
                null,
                null,
                auditService.getIpAddress(req),
                auditService.getUserAgent(req),
                false,
                'User not found'
            );
            return errorResponse(res, 'Invalid credentials', 401);
        }

        if (!user.is_active) {
            return errorResponse(res, 'Account is deactivated', 403);
        }

        // Check password
        const isMatch = await comparePassword(password, user.password);
        if (!isMatch) {
            // Log failed login attempt
            await auditService.logLogin(
                user.organization_id,
                user.id,
                auditService.getIpAddress(req),
                auditService.getUserAgent(req),
                false,
                'Invalid password'
            );
            return errorResponse(res, 'Invalid credentials', 401);
        }

        // Generate tokens
        const accessToken = generateAccessToken(user.id);
        const refreshTokenStr = generateRefreshToken(user.id);

        // Save refresh token to DB
        const decoded = decodeToken(refreshTokenStr);
        await RefreshToken.create({
            token: refreshTokenStr,
            user_id: user.id,
            organization_id: user.organization_id, // Added organization_id
            expires_at: new Date(decoded.exp * 1000)
        });

        // Update last login
        user.last_login = new Date();
        await user.save();

        // Log successful login
        await auditService.logLogin(
            user.organization_id,
            user.id,
            auditService.getIpAddress(req),
            auditService.getUserAgent(req),
            true
        );

        // Consolidate branches from both User (Super Admin) and Employee assignments
        let allBranches = [...(user.branches || [])];
        const isSuperAdmin = user.roles?.some(role => role.name === 'Super Admin');

        // Industrial Logic: Super Admins automatically get access to ALL branches in their organization
        if (isSuperAdmin && user.organization_id) {
            allBranches = await Branch.findAll({
                where: { organization_id: user.organization_id, is_active: true },
                attributes: ['id', 'name']
            });
        } else if (user.employee && user.employee.branches) {
            user.employee.branches.forEach(eb => {
                if (!allBranches.find(b => b.id === eb.id)) allBranches.push(eb);
            });
        }

        return successResponse(res, {
            user: {
                id: user.id,
                name: user.employee?.name || user.name,
                email: user.email,
                profile_image: user.profile_image,
                organization_id: user.organization_id,
                organization: user.organization ? {
                    id: user.organization.id,
                    name: user.organization.name,
                    logo: user.organization.logo
                } : null,
                roles: user.roles,
                branches: allBranches
            },
            auth_token: accessToken,
            refresh_token: refreshTokenStr
        }, 'Login successful');
    } catch (error) {
        next(error);
    }
};

const refresh = async (req, res, next) => {
    try {
        const { refresh_token } = req.body;
        if (!refresh_token) {
            return errorResponse(res, 'Refresh token required', 400);
        }

        // Find token in DB
        const savedToken = await RefreshToken.findOne({
            where: { token: refresh_token },
            include: [{ model: User, as: 'user' }]
        });

        // 1. Detect Token Reuse (Attacker might be using an old token)
        if (!savedToken) {
            // Check if this token was previously revoked (meaning it was replaced)
            // Note: In this simple implementation, we delete used tokens. 
            // If it's missing, it could be reuse or just expired.
            // For extra security, we could keep revoked tokens with a revoked_at date.
            return errorResponse(res, 'Invalid refresh token', 401);
        }

        // 2. Verify JWT signature and expiry
        let payload;
        try {
            payload = verifyToken(refresh_token, true);
        } catch (err) {
            // If JWT is invalid or expired, delete it from DB
            await savedToken.destroy();
            return errorResponse(res, 'Invalid or expired refresh token', 401);
        }

        // 3. Check DB expiry (extra safety)
        if (savedToken.expires_at < new Date()) {
            await savedToken.destroy();
            return errorResponse(res, 'Refresh token expired', 401);
        }

        // 4. Generate new tokens (Rotation)
        const user = savedToken.user;
        const newAccessToken = generateAccessToken(user.id);
        const newRefreshTokenStr = generateRefreshToken(user.id);

        // 5. Replace old token in DB (Atomic rotation)
        const decoded = decodeToken(newRefreshTokenStr);
        await RefreshToken.create({
            token: newRefreshTokenStr,
            user_id: user.id,
            organization_id: user.organization_id, // Added organization_id
            expires_at: new Date(decoded.exp * 1000)
        });

        await savedToken.destroy();

        return successResponse(res, {
            auth_token: newAccessToken,
            refresh_token: newRefreshTokenStr
        }, 'Token refreshed');

    } catch (error) {
        next(error);
    }
};

const logout = async (req, res, next) => {
    try {
        const { refresh_token } = req.body;
        if (refresh_token) {
            // Delete the refresh token from DB
            await RefreshToken.destroy({ where: { token: refresh_token } });
        }
        return successResponse(res, null, 'Logged out successfully');
    } catch (error) {
        next(error);
    }
};

const register = async (req, res, next) => {
    try {
        const { name, email, password } = req.body;

        // Check if user exists
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return errorResponse(res, 'Email already registered', 409);
        }

        // Hash password
        const hashedPassword = await hashPassword(password);

        // Create user
        const user = await User.create({
            name,
            email,
            password: hashedPassword
        });

        return successResponse(res, {
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        }, 'Registration successful', 201);
    } catch (error) {
        next(error);
    }
};

const me = async (req, res) => {
    const user = req.user;
    const isSuperAdmin = user.roles?.some(role => role.name === 'Super Admin');
    
    // Consolidate branches
    let allBranches = [...(user.branches || [])];
    
    // Industrial Logic: Super Admins automatically get access to ALL branches in their organization
    if (isSuperAdmin && user.organization_id) {
        allBranches = await Branch.findAll({
            where: { organization_id: user.organization_id, is_active: true },
            attributes: ['id', 'name']
        });
    } else if (user.employee && user.employee.branches) {
        user.employee.branches.forEach(eb => {
            if (!allBranches.find(b => b.id === eb.id)) allBranches.push(eb);
        });
    }

    return successResponse(res, {
        user: {
            id: user.id,
            name: user.employee?.name || user.name,
            email: user.email,
            profile_image: user.profile_image,
            organization_id: user.organization_id,
            organization: user.organization ? {
                id: user.organization.id,
                name: user.organization.name,
                logo: user.organization.logo
            } : null,
            roles: user.roles,
            branches: allBranches
        }
    }, 'User profile fetched');
};

module.exports = {
    login,
    refresh,
    logout,
    register,
    me
};
