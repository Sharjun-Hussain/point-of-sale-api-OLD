const jwt = require('jsonwebtoken');
const { User, Role, Permission, Branch, Employee } = require('../models');

/**
 * Authentication Middleware
 * Verifies JWT token and attaches user to request
 */
const authenticate = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                status: 'error',
                message: 'No token provided'
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Get user from database with roles and permissions
        const user = await User.findByPk(decoded.id, {
            include: [
                {
                    model: Role,
                    as: 'roles',
                    include: [
                        {
                            model: Permission,
                            as: 'permissions'
                        }
                    ]
                },
                {
                    model: Branch,
                    as: 'branches'
                },
                {
                    model: Employee,
                    as: 'employee',
                    include: [{ model: Branch, as: 'branches' }]
                }
            ]
        });

        if (!user) {
            return res.status(401).json({
                status: 'error',
                message: 'User not found'
            });
        }

        if (!user.is_active) {
            return res.status(403).json({
                status: 'error',
                message: 'Account is deactivated'
            });
        }

        // Attach user to request
        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid token'
            });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                status: 'error',
                message: 'Token expired'
            });
        }

        next(error);
    }
};

module.exports = authenticate;
