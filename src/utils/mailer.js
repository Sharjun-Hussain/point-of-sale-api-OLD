const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const { decrypt } = require('./security');

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
 * Helper to generate nodemailer transport configuration based on provider
 */
const getTransportConfig = (provider, config) => {
    // Decrypt sensitive fields if they are encrypted
    const decConfig = {};
    for (const key in config) {
        decConfig[key] = decrypt(config[key]);
    }

    switch (provider) {
        case 'smtp':
            if (!decConfig.Host || !decConfig.Port) return null;
            return {
                host: decConfig.Host,
                port: parseInt(decConfig.Port),
                secure: decConfig.Encryption === 'SSL/TLS' || decConfig.Port === '465',
                auth: { user: decConfig.Username, pass: decConfig.Password }
            };

        case 'brevo':
            if (!decConfig['API Key']) return null;
            return {
                host: 'smtp-relay.brevo.com',
                port: 587,
                auth: { 
                    user: decConfig['From Email'], 
                    pass: decConfig['API Key'] 
                }
            };

        case 'sendgrid':
            if (!decConfig['API Key']) return null;
            return {
                host: 'smtp.sendgrid.net',
                port: 587,
                auth: { 
                    user: 'apikey', 
                    pass: decConfig['API Key'] 
                }
            };

        case 'ses':
            if (!decConfig['Access Key'] || !decConfig['Secret Key']) return null;
            const region = decConfig['Region'] || 'us-east-1';
            return {
                host: `email-smtp.${region}.amazonaws.com`,
                port: 587,
                auth: { 
                    user: decConfig['Access Key'], 
                    pass: decConfig['Secret Key'] 
                }
            };

        case 'mailgun':
            if (!decConfig['API Key'] || !decConfig['Domain']) return null;
            return {
                host: decConfig.Region === 'EU' ? 'smtp.eu.mailgun.org' : 'smtp.mailgun.org',
                port: 587,
                auth: { 
                    user: decConfig['Username'] || `postmaster@${decConfig['Domain']}`, 
                    pass: decConfig['Password'] || decConfig['API Key'] 
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

            if (setting?.settings_data?.email?.enabled) {
                const { provider, config, fromName: customFromName } = setting.settings_data.email;
                const transportConfig = getTransportConfig(provider, config);

                if (transportConfig) {
                    activeTransporter = nodemailer.createTransport(transportConfig);
                    fromEmail = transportConfig.auth.user || fromEmail;
                    if (customFromName) fromName = customFromName;
                    console.log(`Using custom ${provider} transport for organization: ${organizationId}`);
                }
            }
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
        console.log('Email dispatched successfully: %s', info.messageId);
        return info;
    } catch (error) {
        console.error('Mail generation failed:', error);
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
        console.error('Connection verification failed:', error);
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
