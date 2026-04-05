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
 * Send an email using SMTP transport.
 * 
 * @param {Object} options - Email options (to, subject, html, attachments, etc.)
 * @returns {Promise} 
 */
const sendEmail = async (options) => {
    try {
        const mailOptions = {
            from: `"${process.env.APP_NAME || 'POS System'}" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
            to: options.to,
            subject: options.subject,
            text: options.text,
            html: options.html,
            attachments: options.attachments || []
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email dispatched successfully: %s', info.messageId);
        return info;
    } catch (error) {
        console.error('Mail generation failed:', error);
        throw new Error('Could not dispatch protocol email');
    }
};

module.exports = {
    sendEmail
};
