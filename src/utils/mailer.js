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
 * Send an email using dynamic SMTP settings from the database (if available).
 * Falls back to default SMTP if settings are not found or disabled.
 * 
 * @param {Object} options - Email options (to, subject, html, etc.)
 * @param {string} organizationId - The organization ID to fetch settings for
 * @returns {Promise}
 */
const sendEmailWithSettings = async (options, organizationId) => {
    try {
        let activeTransporter = transporter;
        let fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER;
        let fromName = process.env.APP_NAME || 'POS System';

        if (organizationId) {
            const { Setting } = require('../models');
            const setting = await Setting.findOne({
                where: {
                    organization_id: organizationId,
                    category: 'communication'
                }
            });

            if (setting && setting.settings_data && setting.settings_data.email && setting.settings_data.email.enabled) {
                const emailData = setting.settings_data.email;
                const { provider, config, fromName: customFromName } = emailData;

                if (provider && config) {
                    let transportConfig = null;

                    switch (provider) {
                        case 'smtp':
                            if (config.Host && config.Port) {
                                transportConfig = {
                                    host: config.Host,
                                    port: parseInt(config.Port),
                                    secure: config.Encryption === 'SSL/TLS' || config.Port === '465',
                                    auth: { user: config.Username, pass: config.Password }
                                };
                                fromEmail = config.Username;
                            }
                            break;

                        case 'brevo':
                            if (config['API Key']) {
                                transportConfig = {
                                    host: 'smtp-relay.brevo.com',
                                    port: 587,
                                    auth: { 
                                        user: config['From Email'] || fromEmail, 
                                        pass: config['API Key'] 
                                    }
                                };
                                fromEmail = config['From Email'] || fromEmail;
                            }
                            break;

                        case 'sendgrid':
                            if (config['API Key']) {
                                transportConfig = {
                                    host: 'smtp.sendgrid.net',
                                    port: 587,
                                    auth: { 
                                        user: 'apikey', 
                                        pass: config['API Key'] 
                                    }
                                };
                                fromEmail = config['From Email'] || fromEmail;
                            }
                            break;

                        case 'ses':
                            if (config['Access Key'] && config['Secret Key']) {
                                const region = config['Region'] || 'us-east-1';
                                transportConfig = {
                                    host: `email-smtp.${region}.amazonaws.com`,
                                    port: 587,
                                    auth: { 
                                        user: config['Access Key'], 
                                        pass: config['Secret Key'] 
                                    }
                                };
                                fromEmail = config['From Email'] || fromEmail;
                            }
                            break;

                        case 'mailgun':
                            if (config['API Key'] && config['Domain']) {
                                transportConfig = {
                                    host: config.Region === 'EU' ? 'smtp.eu.mailgun.org' : 'smtp.mailgun.org',
                                    port: 587,
                                    auth: { 
                                        user: config['Username'] || `postmaster@${config['Domain']}`, 
                                        pass: config['Password'] || config['API Key'] 
                                    }
                                };
                                fromEmail = config['From Email'] || `no-reply@${config['Domain']}`;
                            }
                            break;
                    }

                    if (transportConfig) {
                        activeTransporter = nodemailer.createTransport(transportConfig);
                        if (customFromName) fromName = customFromName;
                        console.log(`Using custom ${provider} transport for organization: ${organizationId}`);
                    }
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

const sendEmail = (options) => sendEmailWithSettings(options, null);

module.exports = {
    sendEmail,
    sendEmailWithSettings
};
