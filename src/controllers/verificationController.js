const { EmailVerification, User, Organization } = require('../models');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const mailer = require('../utils/mailer');
const crypto = require('crypto');
const { Op } = require('sequelize');

/**
 * Request a verification code for an email
 */
const requestVerificationCode = async (req, res, next) => {
    try {
        const { email } = req.body;
        const organization_id = req.user.organization_id;

        if (!email) return errorResponse(res, 'Email is required', 400);

        // 1. Check if email already exists in system
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) return errorResponse(res, 'This email is already registered in the system.', 409);

        // 2. Security Check: Is this email already verified for this organization?
        // This handles cases where the form was closed but verification was already completed.
        const alreadyVerified = await EmailVerification.findOne({
            where: { 
                email, 
                organization_id, 
                is_verified: true,
                expires_at: { [Op.gt]: new Date() } // Must not be expired
            }
        });

        if (alreadyVerified) {
            return successResponse(res, { verified: true }, 'Identity previously verified. You may proceed with account provisioning.');
        }

        // 3. Organization-level Security: Check for existing active requests (Cool-down and Rate Limiting)
        // We only allow 1 active (unverified) request at a time per organization to prevent spam
        const activeRequest = await EmailVerification.findOne({
            where: {
                organization_id,
                is_verified: false,
                expires_at: { [Op.gt]: new Date() }
            },
            order: [['created_at', 'DESC']]
        });

        if (activeRequest) {
            const now = new Date();
            const lastRequested = new Date(activeRequest.createdAt);
            const diffSeconds = Math.floor((now - lastRequested) / 1000);
            const cooldown = 60; // 60 seconds cooldown

            if (diffSeconds < cooldown) {
                return errorResponse(res, `Security Protocol: Please wait ${cooldown - diffSeconds} seconds before requesting another code for this organization.`, 429);
            }
            
            // If it's a different email, we "cancel" the previous one by expiring it immediately
            // This allows the user to change their mind without being locked out for 15 minutes.
            if (activeRequest.email !== email) {
                activeRequest.expires_at = new Date();
                await activeRequest.save();
            }
        }

        // 3. Generate a 6-digit numeric code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expires_at = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        // 3. Store or Update verification request
        await EmailVerification.upsert({
            email,
            code,
            organization_id,
            expires_at,
            is_verified: false
        }, {
            where: { email, organization_id }
        });

        // 4. Send Email
        try {
            await mailer.sendVerificationEmail(email, code, organization_id);
        } catch (mailError) {
            console.error('Verification Email Dispatch Failed:', mailError);
            return errorResponse(res, 'Failed to send verification email. Please try again later.', 500);
        }

        return successResponse(res, null, 'Verification code sent to email.');
    } catch (error) { next(error); }
};

/**
 * Confirm the verification code
 */
const confirmVerificationCode = async (req, res, next) => {
    try {
        const { email, code } = req.body;
        const organization_id = req.user.organization_id;

        if (!email || !code) return errorResponse(res, 'Email and code are required', 400);

        const verification = await EmailVerification.findOne({
            where: {
                email,
                code,
                organization_id,
                expires_at: { [Op.gt]: new Date() }
            }
        });

        if (!verification) {
            return errorResponse(res, 'Invalid or expired verification code.', 400);
        }

        // Mark as verified and extend expiration for the account creation window
        // We give the admin 1 hour to complete the "Create User" form after verification
        verification.is_verified = true;
        verification.expires_at = new Date(Date.now() + 60 * 60 * 1000); // 1 hour grace period
        await verification.save();

        return successResponse(res, { verified: true }, 'Email verified successfully.');
    } catch (error) { next(error); }
};

module.exports = {
    requestVerificationCode,
    confirmVerificationCode
};
