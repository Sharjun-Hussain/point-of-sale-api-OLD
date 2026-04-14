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
 * Send an email using dynamic SMTP settings from the database (if available).
 */
const sendEmailWithSettings = async (options, organizationId) => {
    try {
        let activeTransporter = transporter;
        let fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER;
        let fromName = process.env.APP_NAME || 'POS System';

        if (organizationId) {
            const { Setting } = require('../models');
            const setting = await Setting.findOne({
                where: { organization_id: organizationId, category: 'communication' }
            });

            // Parse settings_data if it comes as a string (industrial serialization handling)
            let settingsData = setting?.settings_data;
            if (settingsData && typeof settingsData === 'string') {
                try {
                    settingsData = JSON.parse(settingsData);
                    // Handle double-escaped strings if they exist
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
                    
                    // Logic: Priority for From Email in the HEADER, but use Auth User as fallback
                    const displayEmail = getNormalizedVal(config, ['From Email', 'fromEmail', 'from_email']);
                    if (displayEmail) fromEmail = displayEmail;
                    else fromEmail = transportConfig.auth.user || fromEmail;

                    if (customFromName) fromName = customFromName;
                    logger.info(`[MAILER] Initializing custom ${provider} gateway for Org: ${organizationId}. Mode: Authenticated Sender.`);
                } else {
                    logger.warn(`[MAILER] Custom ${provider} config was found for Org: ${organizationId} but was INCOMPLETE. Falling back to default.`);
                }
            } else {
                logger.info(`[MAILER] No active custom email setting found for Org: ${organizationId}. Using system default.`);
            }
        } else {
            logger.info(`[MAILER] No organizationId provided. Using system default.`);
        }

        const mailOptions = {
            from: `"${fromName}" <${fromEmail}>`,
            to: options.to,
            subject: options.subject,
            text: options.text,
            html: options.html,
            attachments: options.attachments || []
        };

        const info = await activeTransporter.sendMail(mailOptions);
        logger.info('[MAILER] Email dispatched successfully: id=%s, from=%s, to=%s', info.messageId, mailOptions.from, mailOptions.to);
        return info;
    } catch (error) {
        logger.error('[MAILER] Execution failed: %s', error.message);
        throw new Error(`Could not dispatch email: ${error.message}`);
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
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #f1f5f9; border-radius: 24px; background-color: #ffffff;">
            <div style="margin-bottom: 30px;">
                <h1 style="color: #059669; font-size: 24px; font-weight: 800; margin-bottom: 8px; letter-spacing: -0.025em;">Welcome to ${appName}</h1>
                <p style="color: #64748b; font-size: 14px; margin-top: 0;">Industrial administrative workstation access initialized.</p>
            </div>
            
            <div style="background-color: #f8fafc; padding: 25px; border-radius: 16px; border: 1px solid #e2e8f0; margin-bottom: 30px;">
                <p style="margin-top: 0; color: #1e293b; font-weight: 600;">Hello ${user.name || 'Staff Member'},</p>
                <p style="color: #475569; line-height: 1.6; font-size: 14px;">A high-access system account has been provisioned for you. Use the following authorization credentials to access the secure workstation portal:</p>
                
                <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                    <tr>
                        <td style="padding: 10px 0; color: #64748b; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; width: 120px;">Portal:</td>
                        <td style="padding: 10px 0; font-weight: 600; color: #1e293b; font-size: 14px;"><a href="${loginUrl}" style="color: #059669; text-decoration: none;">${loginUrl}</a></td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 0; color: #64748b; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Auth Email:</td>
                        <td style="padding: 10px 0; font-weight: 600; color: #1e293b; font-size: 14px;">${user.email}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 0; color: #64748b; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Secure Code:</td>
                        <td style="padding: 10px 0; font-weight: 700; color: #dc2626; font-family: monospace; font-size: 16px; background: #fee2e2; display: inline-block; padding: 4px 12px; border-radius: 6px;">${password}</td>
                    </tr>
                </table>
            </div>

            <div style="text-align: center;">
                <a href="${loginUrl}" style="display: inline-block; background-color: #059669; color: white; padding: 14px 40px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 0.025em; box-shadow: 0 10px 15px -3px rgba(5, 150, 105, 0.2);">Initialize Workstation</a>
            </div>

            <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 30px 0;" />
            
            <div style="background-color: #fef2f2; padding: 15px; border-radius: 12px; border: 1px solid #fee2e2;">
                <p style="font-size: 12px; color: #991b1b; text-align: center; margin: 0; font-weight: 600; line-height: 1.5;">
                    Security Protocol: For data protection, please change your authorization code immediately upon first entry to the system.
                </p>
            </div>
            
            <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 25px;">
                This is an automated system notification. If you did not request this identity, please contact internal security.
            </p>
        </div>
    `;

    return sendEmailWithSettings({
        to: user.email,
        subject,
        html,
        text: `Welcome to ${appName}. Your system credentials: User: ${user.email}, Code: ${password}. Access at ${loginUrl}`
    }, organizationId);
};

const sendEmail = (options) => sendEmailWithSettings(options, null);

module.exports = {
    sendEmail,
    sendEmailWithSettings,
    sendWelcomeEmail,
    verifyEmailConnection
};
