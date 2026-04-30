const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config();

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard for GCM
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;

// Derive a 32-byte key from the environment secret
const getEncryptionKey = () => {
    const rawSecret = process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET || 'fallback-secret-for-development';
    // Use pbkdf2 to ensure we have a high-entropy 32-byte key
    return crypto.pbkdf2Sync(rawSecret, 'some-salt-pos', 100000, 32, 'sha256');
};

/**
 * Encrypt a string using AES-256-GCM
 */
const encrypt = (text) => {
    if (!text || typeof text !== 'string') return text;
    
    // Don't re-encrypt if already looks like an encrypted blob
    if (text.startsWith('pos-enc:')) return text;

    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const key = getEncryptionKey();
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag().toString('hex');
        
        // Format: prefix:iv:authTag:ciphertext
        return `pos-enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
    } catch (error) {
        console.error('Encryption failed:', error);
        return text;
    }
};

/**
 * Decrypt a string using AES-256-GCM
 */
const decrypt = (text) => {
    if (!text || typeof text !== 'string' || !text.startsWith('pos-enc:')) return text;

    try {
        // Split only on first 3 colons to handle any colons inside ciphertext
        const withoutPrefix = text.slice('pos-enc:'.length); // strip "pos-enc:"
        const firstColon = withoutPrefix.indexOf(':');
        const secondColon = withoutPrefix.indexOf(':', firstColon + 1);

        const iv = Buffer.from(withoutPrefix.substring(0, firstColon), 'hex');
        const authTag = Buffer.from(withoutPrefix.substring(firstColon + 1, secondColon), 'hex');
        const encryptedText = withoutPrefix.substring(secondColon + 1);
        
        const key = getEncryptionKey();
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        // If decryption fails, it might be unencrypted legacy data or wrong key
        console.error('Decryption failed, returning original text:', error.message);
        return text;
    }
};

/**
 * Check if a value is masked
 */
const isMasked = (text) => {
    return text === '********';
};

module.exports = {
    encrypt,
    decrypt,
    isMasked,
    MASK: '********'
};
