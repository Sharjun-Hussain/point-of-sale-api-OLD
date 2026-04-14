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
                const emailConfig = setting.settings_data.email;
                const config = emailConfig.config;

                if (config && config.Host && config.Port && config.Username && config.Password) {
                    activeTransporter = nodemailer.createTransport({
                        host: config.Host,
                        port: parseInt(config.Port),
                        secure: config.Encryption === 'SSL/TLS' || config.Port === '465',
                        auth: {
                            user: config.Username,
                            pass: config.Password
                        }
                    });
                    fromEmail = config.Username;
                    if (emailConfig.fromName) fromName = emailConfig.fromName;
                    
                    console.log(`Using custom SMTP for organization: ${organizationId}`);
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
        throw new Error('Could not dispatch protocol email');
    }
};

const sendEmail = (options) => sendEmailWithSettings(options, null);

module.exports = {
    sendEmail,
    sendEmailWithSettings
};
