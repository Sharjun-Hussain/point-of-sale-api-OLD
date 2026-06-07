const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const { decrypt } = require('./security');
const logger = require('./logger');

dotenv.config();

/**
 * Centered Mail Utility for PO & Sales
 */
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
    }
});

/**
 * Normalization helper: find a value by multiple possible key variations
 */
const getNormalizedVal = (data, keys) => {
    if (!data) return null;
    for (const k of keys) {
        if (data[k] !== undefined) return data[k];
        // Also check normalized versions
        const normalizedK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const actualKey in data) {
            const normalizedActual = actualKey.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normalizedActual === normalizedK) return data[actualKey];
        }
    }
    return null;
};

/**
 * Helper to generate nodemailer transport configuration based on provider
 * Robustness: Handles variations in key naming (spaces, casing, underscores)
 */
const getTransportConfig = (provider, config) => {
    if (!config) return null;

    // Decrypt sensitive fields if they are encrypted
    const decConfig = {};
    for (const key in config) {
        decConfig[key] = decrypt(config[key]);
    }

    const getVal = (keys) => getNormalizedVal(decConfig, keys);

    switch (provider) {
        case 'smtp':
            const host = getVal(['Host', 'smtpHost', 'smtp_host']);
            const port = getVal(['Port', 'smtpPort', 'smtp_port']);
            if (!host || !port) return null;
            return {
                host,
                port: parseInt(port),
                secure: getVal(['Encryption']) === 'SSL/TLS' || port === '465',
                auth: { 
                    user: getVal(['Username', 'user', 'smtp_user']), 
                    pass: getVal(['Password', 'pass', 'smtp_pass']) 
                }
            };

        case 'brevo':
            const brevoKey = getVal(['API Key', 'apiKey', 'api_key']);
            if (!brevoKey) return null;
            return {
                host: 'smtp-relay.brevo.com',
                port: 587,
                auth: { 
                    user: getVal(['Username', 'user', 'fromEmail', 'From Email', 'from_email']), 
                    pass: brevoKey 
                }
            };

        case 'sendgrid':
            const sgKey = getVal(['API Key', 'apiKey', 'api_key']);
            if (!sgKey) return null;
            return {
                host: 'smtp.sendgrid.net',
                port: 587,
                auth: { 
                    user: 'apikey', 
                    pass: sgKey 
                }
            };

        case 'ses':
            const accessKey = getVal(['Access Key', 'accessKey', 'access_key']);
            const secretKey = getVal(['Secret Key', 'secretKey', 'secret_key']);
            if (!accessKey || !secretKey) return null;
            const region = getVal(['Region', 'region']) || 'us-east-1';
            return {
                host: `email-smtp.${region}.amazonaws.com`,
                port: 587,
                auth: { 
                    user: accessKey, 
                    pass: secretKey 
                }
            };

        case 'mailgun':
            const mgKey = getVal(['API Key', 'apiKey', 'api_key']);
            const domain = getVal(['Domain', 'domain']);
            if (!mgKey || !domain) return null;
            const mgRegion = getVal(['Region', 'region']);
            return {
                host: mgRegion === 'EU' ? 'smtp.eu.mailgun.org' : 'smtp.mailgun.org',
                port: 587,
                auth: { 
                    user: getVal(['Username']) || `postmaster@${domain}`, 
                    pass: getVal(['Password']) || mgKey 
                }
            };

        default:
            return null;
    }
};

/**
 * System Fallback Transporter (Brevo)
 * Used if organization settings are missing or failing.
 */
const fallbackTransporter = (process.env.FALLBACK_EMAIL_API_KEY) 
    ? nodemailer.createTransport({
        host: 'smtp-relay.brevo.com',
        port: 587,
        auth: { 
            user: process.env.FALLBACK_EMAIL_USER, 
            pass: process.env.FALLBACK_EMAIL_API_KEY 
        }
    })
    : null;

if (fallbackTransporter) {
    logger.info('📩 [MAILER] Brevo Fallback Transporter initialized and ready.');
} else {
    logger.warn('⚠️ [MAILER] Brevo Fallback NOT initialized. Check FALLBACK_EMAIL_API_KEY in .env');
}

/**
 * Send an email using dynamic SMTP settings from the database (if available).
 */
const sendEmailWithSettings = async (options, organizationId) => {
    let activeTransporter = transporter;
    let fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER;
    let fromName = process.env.APP_NAME || 'POS System';
    let usingCustom = false;

    try {
        if (organizationId) {
            const { Setting } = require('../models');
            const setting = await Setting.findOne({
                where: { organization_id: organizationId, category: 'communication' }
            });

            let settingsData = setting?.settings_data;
            if (settingsData && typeof settingsData === 'string') {
                try {
                    settingsData = JSON.parse(settingsData);
                    if (typeof settingsData === 'string') settingsData = JSON.parse(settingsData);
                } catch (e) {
                    console.error('[MAILER] Failed to parse settings_data string:', e);
                }
            }

            if (settingsData?.email?.enabled) {
                const { provider, config, fromName: customFromName } = settingsData.email;
                const transportConfig = getTransportConfig(provider, config);

                if (transportConfig) {
                    activeTransporter = nodemailer.createTransport(transportConfig);
                    const displayEmail = getNormalizedVal(config, ['From Email', 'fromEmail', 'from_email']);
                    if (displayEmail) fromEmail = displayEmail;
                    else fromEmail = transportConfig.auth.user || fromEmail;

                    if (customFromName) fromName = customFromName;
                    usingCustom = true;
                }
            }
        }

        // --- SMART ROUTING: If primary is empty but fallback exists, use fallback immediately ---
        const isDefaultIncomplete = !usingCustom && (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD);
        if (isDefaultIncomplete && fallbackTransporter) {
            logger.info('[MAILER] Default SMTP incomplete. Routing directly to Brevo Fallback.');
            activeTransporter = fallbackTransporter;
            fromEmail = process.env.FALLBACK_EMAIL_USER || fromEmail;
            fromName = process.env.FALLBACK_EMAIL_NAME || fromName;
        }

        const mailOptions = {
            from: `"${fromName}" <${fromEmail}>`,
            to: options.to,
            subject: options.subject,
            text: options.text,
            html: options.html,
            attachments: options.attachments || []
        };

        try {
            const info = await activeTransporter.sendMail(mailOptions);
            logger.info('[MAILER] Email dispatched: %s', info.messageId);
            return info;
        } catch (primaryError) {
            // If we already used fallback, just throw the error
            if (activeTransporter === fallbackTransporter) throw primaryError;

            logger.warn(`[MAILER] Primary dispatch failed: ${primaryError.message}.`);
            
            if (fallbackTransporter) {
                logger.info('[MAILER] Attempting Brevo system fallback after failure...');
                const fallbackMailOptions = {
                    ...mailOptions,
                    from: `"${process.env.FALLBACK_EMAIL_NAME || process.env.APP_NAME || 'POS System'}" <${process.env.FALLBACK_EMAIL_FROM || process.env.FALLBACK_EMAIL_USER}>`
                };
                logger.info(`[MAILER] Fallback details: From="${fallbackMailOptions.from}"`);
                try {
                    const fallbackInfo = await fallbackTransporter.sendMail(fallbackMailOptions);
                    logger.info('[MAILER] Fallback success: %s', fallbackInfo.messageId);
                    return fallbackInfo;
                } catch (fallbackError) {
                    throw new Error(`Primary Failed: ${primaryError.message} | Fallback Failed: ${fallbackError.message}`);
                }
            } else {
                throw primaryError;
            }
        }
    } catch (error) {
        logger.error('[MAILER] Fatal delivery failure: %s', error.message);
        throw new Error(error.message); // Return clean error to frontend
    }
};

/**
 * Verify an email connection with provided configuration
 */
const verifyEmailConnection = async (provider, config) => {
    try {
        const transportConfig = getTransportConfig(provider, config);
        if (!transportConfig) throw new Error('Incomplete configuration parameters');

        const testTransporter = nodemailer.createTransport(transportConfig);
        await testTransporter.verify();
        return { success: true, message: 'Connection established successfully' };
    } catch (error) {
        logger.error('[MAILER] Connection verification failed: %s', error.message);
        return { success: false, message: error.message };
    }
};

/**
 * Send a structured Welcome/Credential delivery email
 */
const sendWelcomeEmail = async (user, password, organizationId) => {
    const appName = process.env.APP_NAME || 'POS System';
    const loginUrl = (process.env.FRONTEND_URL?.split(',')[2] || process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:3000').trim();

    const subject = `Welcome to ${appName} - Your System Credentials`;
    const html = `
        <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <!-- Header section -->
            <div style="background-color: #0f172a; padding: 40px 30px; text-align: center;">
                <div style="background: rgba(255,255,255,0.05); width: 56px; height: 56px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1);">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                </div>
                <h1 style="color: #f8fafc; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.025em;">Welcome to ${appName}</h1>
                <p style="color: #94a3b8; font-size: 14px; margin-top: 8px; margin-bottom: 0;">Secure Workspace Initialization</p>
            </div>
            
            <!-- Body section -->
            <div style="padding: 40px 30px;">
                <p style="margin-top: 0; color: #0f172a; font-weight: 600; font-size: 15px;">Hello ${user.name || 'Team Member'},</p>
                <p style="color: #475569; line-height: 1.6; font-size: 14px; margin-bottom: 30px;">Your administrative access has been successfully provisioned. Please use the secure credentials below to authenticate into the system.</p>
                
                <div style="background-color: #f8fafc; padding: 0; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 30px; overflow: hidden;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px; font-weight: 600; width: 100px; background-color: #f1f5f9;">Portal</td>
                            <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; font-weight: 500; font-size: 14px;"><a href="${loginUrl}" style="color: #0284c7; text-decoration: none;">${loginUrl}</a></td>
                        </tr>
                        <tr>
                            <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px; font-weight: 600; background-color: #f1f5f9;">System ID</td>
                            <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #0f172a; font-size: 14px;">${user.email}</td>
                        </tr>
                        <tr>
                            <td style="padding: 16px 20px; color: #64748b; font-size: 13px; font-weight: 600; background-color: #f1f5f9;">Auth Key</td>
                            <td style="padding: 16px 20px; font-weight: 700; color: #0f172a; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 15px;">
                                <span style="background: #e2e8f0; padding: 4px 8px; border-radius: 4px; letter-spacing: 0.05em;">${password}</span>
                            </td>
                        </tr>
                    </table>
                </div>

                <div style="text-align: center; margin-bottom: 30px;">
                    <a href="${loginUrl}" style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; transition: background-color 0.2s;">Authenticate Now &rarr;</a>
                </div>

                <div style="background-color: #fff1f2; padding: 16px 20px; border-radius: 6px; border-left: 4px solid #e11d48;">
                    <p style="font-size: 13px; color: #be123c; margin: 0; line-height: 1.5;">
                        <strong>Security Protocol:</strong> You are required to update your authorization key immediately upon your first successful login.
                    </p>
                </div>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #f8fafc; padding: 24px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="font-size: 12px; color: #64748b; margin: 0; line-height: 1.5;">
                    This is an automated administrative notification.<br>
                    If you did not request this access, please contact your systems administrator immediately.
                </p>
                <p style="font-size: 11px; color: #94a3b8; margin-top: 16px; margin-bottom: 0; text-transform: uppercase; letter-spacing: 0.05em;">
                    &copy; ${new Date().getFullYear()} ${appName} - Secure Systems
                </p>
            </div>
        </div>
    `;

    return sendEmailWithSettings({
        to: user.email,
        subject,
        html,
        text: `Welcome to ${appName}. Your system credentials: User: ${user.email}, Code: ${password}. Access at ${loginUrl}`
    }, organizationId);
};

/**
 * Send a security notification when a password is changed
 */
const sendPasswordChangeNotification = async (user, organizationId, isAdminAction = false) => {
    const appName = process.env.APP_NAME || 'POS System';
    const subject = `Security Alert: Your ${appName} Password Was Changed`;
    
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #f1f5f9; border-radius: 24px; background-color: #ffffff;">
            <div style="margin-bottom: 25px; text-align: center;">
                <div style="display: inline-block; p-2 bg-red-50 rounded-full; margin-bottom: 15px;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                </div>
                <h1 style="color: #1e293b; font-size: 22px; font-weight: 800; margin: 0; letter-spacing: -0.025em;">Security Notification</h1>
            </div>
            
            <div style="background-color: #fef2f2; padding: 25px; border-radius: 16px; border: 1px solid #fee2e2; margin-bottom: 25px;">
                <p style="margin-top: 0; color: #991b1b; font-weight: 700; font-size: 16px;">Hello ${user.name},</p>
                <p style="color: #b91c1c; line-height: 1.6; font-size: 14px; margin-bottom: 0;">
                    ${isAdminAction 
                        ? 'This is to inform you that your account password has been updated by a system administrator.' 
                        : 'This is to inform you that your account password has been successfully changed.'}
                </p>
            </div>

            <div style="padding: 0 10px; margin-bottom: 30px;">
                <p style="color: #475569; font-size: 14px; font-weight: 600; margin-bottom: 10px;">If this was YOU:</p>
                <p style="color: #64748b; font-size: 13px; margin: 0;">You can safely ignore this message. No further action is required.</p>
                
                <div style="margin-top: 25px; pt-5 border-top: 1px solid #f1f5f9;">
                    <p style="color: #991b1b; font-size: 14px; font-weight: 700; margin-bottom: 10px;">If this was NOT you:</p>
                    <p style="color: #475569; font-size: 13px; line-height: 1.5; margin: 0;">
                        Please contact your **System Administrator** immediately to secure your account. Your current credentials have been replaced and your previous access has been revoked.
                    </p>
                </div>
            </div>

            <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 25px;">
                Timestamp: ${new Date().toUTCString()}<br>
                Security protocol enforced by Inzeedo POS Systems.
            </p>
        </div>
    `;

    return sendEmailWithSettings({
        to: user.email,
        subject,
        html,
        text: `Security Notification: Your ${appName} password has been changed. If you did not request this, please contact your administrator.`
    }, organizationId);
};

/**
 * Send a notification when a new module/addon is activated
 */
const sendAddonActivationEmail = async (organization, moduleNames) => {
    const appName = process.env.APP_NAME || 'POS System';
    const loginUrl = (process.env.FRONTEND_URL?.split(',')[2] || process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:3000').trim();

    const subject = `🚀 Add-on Activated: New Capabilities for ${organization.name}`;
    
    const modulesHtml = moduleNames.map(m => `
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px 16px; border-radius: 12px; margin-bottom: 10px; display: flex; align-items: center; gap: 12px;">
            <div style="background: #16a34a; color: white; width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; flex-shrink: 0;">✓</div>
            <span style="color: #166534; font-weight: 700; font-size: 14px;">${m}</span>
        </div>
    `).join('');

    const html = `
        <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 30px; border: 1px solid #f1f5f9; border-radius: 32px; background-color: #ffffff; color: #1e293b;">
            <div style="text-align: center; margin-bottom: 32px;">
                <div style="background: #f0fdf4; width: 64px; height: 64px; border-radius: 20px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
                </div>
                <h1 style="font-size: 24px; font-weight: 800; margin: 0; color: #0f172a; letter-spacing: -0.025em;">Expansion Complete!</h1>
                <p style="color: #64748b; font-size: 14px; margin-top: 8px;">New administrative protocols have been initialized for your business.</p>
            </div>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 24px; padding: 32px; margin-bottom: 32px;">
                <p style="margin-top: 0; font-size: 15px; line-height: 1.6; color: #334155;">
                    Hello <strong>${organization.name}</strong>,
                </p>
                <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-bottom: 24px;">
                    Congratulations! Your requested system add-ons are now active. You can immediately access these features from your workstation dashboard:
                </p>

                <div style="margin-bottom: 24px;">
                    ${modulesHtml}
                </div>

                <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 0;">
                    These capabilities have been seamlessly integrated into your existing environment. No restart or re-login is required to begin using them.
                </p>
            </div>

            <div style="text-align: center; margin-bottom: 40px;">
                <a href="${loginUrl}" style="display: inline-block; background-color: #16a34a; color: white; padding: 16px 40px; text-decoration: none; border-radius: 14px; font-weight: 700; font-size: 15px; letter-spacing: 0.01em; box-shadow: 0 10px 15px -3px rgba(22, 163, 74, 0.2);">Enter Workstation</a>
            </div>

            <div style="border-top: 1px solid #f1f5f9; padding-top: 30px; text-align: center;">
                <p style="font-size: 12px; color: #94a3b8; line-height: 1.6;">
                    Thank you for growing with ${appName}.<br>
                    Need assistance with these new features? Contact our 24/7 technical support.
                </p>
            </div>
            
            <p style="font-size: 10px; color: #cbd5e1; text-align: center; margin-top: 24px; text-transform: uppercase; letter-spacing: 0.05em;">
                Automated Transactional Notification • ${new Date().getFullYear()} ${appName}
            </p>
        </div>
    `;

    return sendEmailWithSettings({
        to: organization.email,
        subject,
        html,
        text: `Congratulations! New add-ons have been activated for ${organization.name}: ${moduleNames.join(', ')}. Access them at ${loginUrl}`
    }, organization.id);
};

const sendEmail = (options) => sendEmailWithSettings(options, null);

/**
 * Send a verification code email
 */
const sendVerificationEmail = async (email, code, organizationId) => {
    const appName = process.env.APP_NAME || 'POS System';
    const subject = `${code} is your ${appName} verification code`;
    
    const html = `
        <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 30px; border: 1px solid #f1f5f9; border-radius: 32px; background-color: #ffffff; color: #1e293b; text-align: center;">
            <div style="background: #f0fdf4; width: 64px; height: 64px; border-radius: 20px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 24px;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            </div>
            
            <h1 style="font-size: 24px; font-weight: 800; margin: 0; color: #0f172a; letter-spacing: -0.025em;">Verify your email</h1>
            <p style="color: #64748b; font-size: 14px; margin-top: 12px; line-height: 1.5;">
                Enter the following code to confirm this email address for account provisioning.
            </p>
            
            <div style="margin: 32px 0;">
                <div style="background: #f8fafc; border: 2px dashed #e2e8f0; padding: 20px; border-radius: 20px; display: inline-block;">
                    <span style="font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; font-size: 36px; font-weight: 800; color: #16a34a; letter-spacing: 0.25em; margin-left: 0.25em;">${code}</span>
                </div>
            </div>
            
            <p style="font-size: 12px; color: #94a3b8; line-height: 1.6;">
                This code will expire in 15 minutes.<br>
                If you did not expect this, please ignore this email.
            </p>
            
            <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 32px 0;" />
            
            <p style="font-size: 10px; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.05em; margin: 0;">
                Security protocol enforced by ${appName}
            </p>
        </div>
    `;

    return sendEmailWithSettings({
        to: email,
        subject,
        html,
        text: `Your ${appName} verification code is: ${code}`
    }, organizationId);
};

module.exports = {
    sendEmail,
    sendEmailWithSettings,
    sendWelcomeEmail,
    sendPasswordChangeNotification,
    sendAddonActivationEmail,
    verifyEmailConnection,
    sendVerificationEmail
};
