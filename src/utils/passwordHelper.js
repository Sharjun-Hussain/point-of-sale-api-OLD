const bcrypt = require('bcryptjs');

/**
 * Hash password
 */
const hashPassword = async (password) => {
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10;
    return await bcrypt.hash(password, saltRounds);
};

/**
 * Compare password with hash
 */
const comparePassword = async (password, hash) => {
    return await bcrypt.compare(password, hash);
};

/**
 * Generate random password
 */
const generateRandomPassword = (length = 12) => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
};

module.exports = {
    hashPassword,
    comparePassword,
    generateRandomPassword
};
