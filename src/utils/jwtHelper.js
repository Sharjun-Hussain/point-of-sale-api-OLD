const jwt = require('jsonwebtoken');

/**
 * Generate JWT access token
 */
const generateAccessToken = (userId) => {
    return jwt.sign(
        { id: userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
    );
};

/**
 * Generate JWT refresh token
 */
const generateRefreshToken = (userId) => {
    return jwt.sign(
        { id: userId },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );
};

/**
 * Verify JWT token
 */
const verifyToken = (token, isRefreshToken = false) => {
    const secret = isRefreshToken ? process.env.JWT_REFRESH_SECRET : process.env.JWT_SECRET;
    return jwt.verify(token, secret);
};

/**
 * Decode JWT token without verification
 */
const decodeToken = (token) => {
    return jwt.decode(token);
};

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    verifyToken,
    decodeToken
};
