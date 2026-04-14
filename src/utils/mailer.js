const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

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
    switch (provider) {
        case 'smtp':
            if (!config.Host || !config.Port) return null;
            return {
                host: config.Host,
                port: parseInt(config.Port),
                secure: config.Encryption === 'SSL/TLS' || config.Port === '465',
                auth: { user: config.Username, pass: config.Password }
            };

        case 'brevo':
            if (!config['API Key']) return null;
            return {
                host: 'smtp-relay.brevo.com',
                port: 587,
                auth: { 
                    user: config['From Email'], 
                    pass: config['API Key'] 
                }
            };

        case 'sendgrid':
            if (!config['API Key']) return null;
            return {
                host: 'smtp.sendgrid.net',
                port: 587,
                auth: { 
                    user: 'apikey', 
                    pass: config['API Key'] 
                }
            };

        case 'ses':
            if (!config['Access Key'] || !config['Secret Key']) return null;
            const region = config['Region'] || 'us-east-1';
            return {
                host: `email-smtp.${region}.amazonaws.com`,
                port: 587,
                auth: { 
                    user: config['Access Key'], 
                    pass: config['Secret Key'] 
                }
            };

        case 'mailgun':
            if (!config['API Key'] || !config['Domain']) return null;
            return {
                host: config.Region === 'EU' ? 'smtp.eu.mailgun.org' : 'smtp.mailgun.org',
                port: 587,
                auth: { 
                    user: config['Username'] || `postmaster@${config['Domain']}`, 
                    pass: config['Password'] || config['API Key'] 
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
