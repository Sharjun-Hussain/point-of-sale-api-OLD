const { User, Role, Permission, Branch, RefreshToken, Employee, Organization } = require('../models');
const { hashPassword, comparePassword } = require('../utils/passwordHelper');
const { generateAccessToken, generateRefreshToken, verifyToken, decodeToken } = require('../utils/jwtHelper');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { sendEmailWithSettings } = require('../utils/mailer');
const auditService = require('../services/auditService');
const upload = require('../middleware/upload');
const crypto = require('crypto');
const { Op } = require('sequelize');

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

const updateMe = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const user = await User.findByPk(userId);
        if (!user) return errorResponse(res, 'User not found', 404);

        const { name, current_password, new_password } = req.body;
        const updateData = {};

        if (name) updateData.name = name;

        // Handle profile image upload
        if (req.file) {
            updateData.profile_image = req.file.path;
        }

        // Handle password change
        if (new_password) {
            if (!current_password) {
                return errorResponse(res, 'Current password is required to set a new password', 400);
            }
            const isMatch = await comparePassword(current_password, user.password);
            if (!isMatch) {
                return errorResponse(res, 'Current password is incorrect', 401);
            }
            updateData.password = await hashPassword(new_password);
        }

        await user.update(updateData);

        const updatedUser = await User.findOne({
            where: { id: userId },
            attributes: ['id', 'name', 'email', 'profile_image', 'organization_id'],
            include: [{ model: Organization, as: 'organization', attributes: ['id', 'name', 'logo'] }]
        });

        return successResponse(res, { user: updatedUser }, 'Profile updated successfully');
    } catch (error) { next(error); }
};

/**
 * Forgot Password - Generates token and sends email
 */
const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ where: { email } });

        if (!user) {
            // Industrial security: even if user not found, we return success to prevent email enumeration
            return successResponse(res, null, 'If an account exists with this email, a reset link has been sent');
        }

        // Generate token
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 3600000); // 1 hour from now

        await user.update({
            reset_password_token: token,
            reset_password_expires: expiry
        });

        // Use the first FRONTEND_URL or default to localhost:3000
        const frontendUrls = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',');
        const resetUrl = `${frontendUrls[0]}/reset-password?token=${token}`;

        await sendEmailWithSettings({
            to: user.email,
            subject: 'Password Reset Request - POS System',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                    <h2 style="color: #10b981; text-align: center;">Password Reset Request</h2>
                    <p>Hello,</p>
                    <p>You are receiving this email because you (or someone else) have requested the reset of the password for your account.</p>
                    <p>Please click on the following link, or paste this into your browser to complete the process:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetUrl}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
                    </div>
                    <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
                    <p style="color: #666; font-size: 12px; margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
                        This link will expire in 1 hour.<br>
                        Sent by Inzeedo POS Systems.
                    </p>
                </div>
            `
        }, user.organization_id);

        return successResponse(res, null, 'If an account exists with this email, a reset link has been sent');
    } catch (error) {
        next(error);
    }
};

/**
 * Reset Password - Validates token and updates password
 */
const resetPassword = async (req, res, next) => {
    try {
        const { token, password } = req.body;

        const user = await User.findOne({
            where: {
                reset_password_token: token,
                reset_password_expires: {
                    [Op.gt]: new Date()
                }
            }
        });

        if (!user) {
            return errorResponse(res, 'Password reset token is invalid or has expired', 400);
        }

        // Update password
        const hashedPassword = await hashPassword(password);
        await user.update({
            password: hashedPassword,
            reset_password_token: null,
            reset_password_expires: null
        });

        // Log the security event
        const { ipAddress, userAgent } = auditService.getRequestContext(req);
        await auditService.logCustom(
            user.organization_id,
            user.id,
            'PASSWORD_RESET',
            'User reset their password via email link',
            ipAddress,
            userAgent
        );

        return successResponse(res, null, 'Password has been reset successfully');
    } catch (error) {
        next(error);
    }
};

module.exports = {
    login,
    refresh,
    logout,
    register,
    me,
    updateMe,
    forgotPassword,
    resetPassword
};
