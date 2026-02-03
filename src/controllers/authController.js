const { User, Role, Permission, Branch } = require('../models');
const { hashPassword, comparePassword } = require('../utils/passwordHelper');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwtHelper');
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
                }
            ]
        });

        if (!user) {
            console.log(`\x1b[31m[AUTH DEBUG] User not found: ${email}\x1b[0m`);
            // Log failed login attempt
            await auditService.logLogin(
                null, // No organization ID for failed login
                null, // No user ID for failed login
                auditService.getIpAddress(req),
                auditService.getUserAgent(req),
                false,
                'User not found'
            );
            return errorResponse(res, 'Invalid credentials', 401);
        }

        console.log(`\x1b[32m[AUTH DEBUG] User found: ${user.email}\x1b[0m`);

        if (!user.is_active) {
            console.log(`\x1b[31m[AUTH DEBUG] User is inactive: ${email}\x1b[0m`);
            return errorResponse(res, 'Account is deactivated', 403);
        }

        // Check password
        console.log(`\x1b[33m[AUTH DEBUG] Comparing passwords...\x1b[0m`);
        const isMatch = await comparePassword(password, user.password);
        console.log(`\x1b[33m[AUTH DEBUG] Password match: ${isMatch}\x1b[0m`);
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
        const refreshToken = generateRefreshToken(user.id);

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

        return successResponse(res, {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                profile_image: user.profile_image,
                organization_id: user.organization_id,
                roles: user.roles,
                branches: user.branches
            },
            auth_token: accessToken,
            refresh_token: refreshToken
        }, 'Login successful');
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

        // Default role assignment can be added here

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
    // req.user is attached by auth middleware
    return successResponse(res, {
        user: {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
            profile_image: req.user.profile_image,
            organization_id: req.user.organization_id,
            roles: req.user.roles,
            branches: req.user.branches
        }
    }, 'User profile fetched');
};

module.exports = {
    login,
    register,
    me
};
