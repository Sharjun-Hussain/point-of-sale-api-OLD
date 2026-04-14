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

const sendEmail = (options) => sendEmailWithSettings(options, null);

module.exports = {
    sendEmail,
    sendEmailWithSettings,
    verifyEmailConnection
};
