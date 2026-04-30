const { Setting, Product, ProductVariant, User, Organization } = require('../models');
const { sendEmailWithSettings } = require('./mailer');
const logger = require('./logger');

/**
 * Alert Manager: Handles business logic for automated notifications
 */
const checkLowStockAlert = async (organizationId, branchId, productId, productVariantId, currentQuantity) => {
    try {
        const setting = await Setting.findOne({
            where: { organization_id: organizationId, category: 'communication', branch_id: null }
        });

        if (!setting) return;

        const alerts = setting.settings_data?.email?.alerts;
        if (!alerts?.lowStock?.enabled) return;

        const threshold = alerts.lowStock.threshold || 10;
        if (currentQuantity <= threshold) {
            // Fetch item details
            const product = await Product.findByPk(productId);
            const variant = productVariantId ? await ProductVariant.findByPk(productVariantId) : null;
            const organization = await Organization.findByPk(organizationId);

            const itemName = variant ? `${product.name} (${variant.name})` : product.name;
            const subject = `⚠️ Low Stock Alert: ${itemName}`;

            const html = `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #d32f2f;">Low Stock Warning</h2>
                    <p>The following item has fallen below its stock threshold:</p>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr><td style="padding: 8px 0; font-weight: bold; width: 120px;">Item:</td><td>${itemName}</td></tr>
                        <tr><td style="padding: 8px 0; font-weight: bold;">Current Qty:</td><td>${currentQuantity}</td></tr>
                        <tr><td style="padding: 8px 0; font-weight: bold;">Threshold:</td><td>${threshold}</td></tr>
                    </table>
                    <p style="margin-top: 20px; font-size: 12px; color: #666;">This is an automated alert from Inzeedo POS.</p>
                </div>
            `;

            // Send to organization email
            await sendEmailWithSettings({
                to: organization.email,
                subject,
                html,
                text: `Low Stock Alert: ${itemName} is at ${currentQuantity} (Threshold: ${threshold})`
            }, organizationId);

            logger.info(`[ALERTS] Low stock email sent for Org: ${organizationId}, Product: ${productId}`);
        }
    } catch (err) {
        logger.error(`[ALERTS] Failed to process low stock alert: ${err.message}`);
    }
};

const checkHighSalesAlert = async (sale) => {
    try {
        const organizationId = sale.organization_id;
        const setting = await Setting.findOne({
            where: { organization_id: organizationId, category: 'communication', branch_id: null }
        });

        if (!setting) return;

        const alerts = setting.settings_data?.email?.alerts;
        if (!alerts?.highSales?.enabled) return;

        const threshold = alerts.highSales.threshold || 100000;
        if (parseFloat(sale.payable_amount) >= threshold) {
            const organization = await Organization.findByPk(organizationId);

            const subject = `💰 High Sale Notification: ${sale.invoice_number}`;
            const html = `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #2e7d32;">High Value Sale Detected</h2>
                    <p>A transaction exceeding your notification threshold has been completed:</p>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr><td style="padding: 8px 0; font-weight: bold; width: 150px;">Invoice:</td><td>${sale.invoice_number}</td></tr>
                        <tr><td style="padding: 8px 0; font-weight: bold;">Amount:</td><td>${organization.currency || 'LKR'} ${parseFloat(sale.payable_amount).toLocaleString()}</td></tr>
                        <tr><td style="padding: 8px 0; font-weight: bold;">Customer:</td><td>${sale.customer_id || 'Guest'}</td></tr>
                    </table>
                    <p style="margin-top: 20px; font-size: 12px; color: #666;">This is an automated notification from Inzeedo POS.</p>
                </div>
            `;

            await sendEmailWithSettings({
                to: organization.email,
                subject,
                html,
                text: `High Sale Notification: ${sale.invoice_number} for ${sale.payable_amount}`
            }, organizationId);

            logger.info(`[ALERTS] High sale notification sent for Org: ${organizationId}, Sale: ${sale.id}`);
        }
    } catch (err) {
        logger.error(`[ALERTS] Failed to process high sales alert: ${err.message}`);
    }
};

const checkUnusualLoginActivity = async (user, ipAddress, userAgent) => {
    try {
        const organizationId = user.organization_id;
        const setting = await Setting.findOne({
            where: { organization_id: organizationId, category: 'communication', branch_id: null }
        });

        if (!setting) return;

        const alerts = setting.settings_data?.email?.alerts;
        if (!alerts?.unusualLogin?.enabled) return;

        const subject = `🛡️ Security Alert: New Login for ${user.name}`;
        const html = `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #f57c00;">Identity Access Notification</h2>
                <p>A login was detected for your account with the following details:</p>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px 0; font-weight: bold; width: 120px;">User:</td><td>${user.name}</td></tr>
                    <tr><td style="padding: 8px 0; font-weight: bold;">IP Address:</td><td>${ipAddress}</td></tr>
                    <tr><td style="padding: 8px 0; font-weight: bold;">Browser/OS:</td><td>${userAgent}</td></tr>
                    <tr><td style="padding: 8px 0; font-weight: bold;">Time:</td><td>${new Date().toUTCString()}</td></tr>
                </table>
                <p style="margin-top: 20px; font-size: 12px; color: #666;">If this wasn't you, please secure your account immediately.</p>
            </div>
        `;

        await sendEmailWithSettings({
            to: user.email,
            subject,
            html,
            text: `Security Alert: Login detected for ${user.name} from ${ipAddress}`
        }, organizationId);

        logger.info(`[ALERTS] Security login alert sent for User: ${user.id}`);
    } catch (err) {
        logger.error(`[ALERTS] Failed to process login alert: ${err.message}`);
    }
};

const checkFailedLoginAlert = async (user, ipAddress, userAgent) => {
    try {
        const organizationId = user.organization_id;
        const setting = await Setting.findOne({
            where: { organization_id: organizationId, category: 'communication', branch_id: null }
        });

        if (!setting) return;

        const alerts = setting.settings_data?.email?.alerts;
        if (!alerts?.unusualLogin?.enabled) return;

        const subject = `❌ Failed Login Attempt: ${user.name}`;

        // Generate a recovery/password reset URL (valid for 1 hour)
        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 3600000);
        await user.update({ reset_password_token: token, reset_password_expires: expiry });

        const frontendUrls = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',');
        const resetUrl = `${frontendUrls[0]}/reset-password?token=${token}`;

        const html = `
            <div style="font-family: sans-serif; padding: 25px; border: 1px solid #fecaca; border-radius: 12px; max-width: 600px; margin: 0 auto; background-color: #fffafb;">
                <h2 style="color: #dc2626; margin-top: 0;">Failed Login Detected</h2>
                <p style="color: #4b5563;">An incorrect password was entered for your account. If this was not you, your account may be under attack.</p>
                
                <div style="background-color: #ffffff; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; margin: 20px 0;">
                    <table style="width: 100%; font-size: 13px;">
                        <tr><td style="color: #6b7280; width: 100px; padding: 5px 0;">IP Address:</td><td style="font-weight: bold;">${ipAddress}</td></tr>
                        <tr><td style="color: #6b7280; padding: 5px 0;">Device/Info:</td><td style="font-weight: bold;">${userAgent}</td></tr>
                        <tr><td style="color: #6b7280; padding: 5px 0;">Timestamp:</td><td style="font-weight: bold;">${new Date().toUTCString()}</td></tr>
                    </table>
                </div>

                <div style="text-align: center; margin-top: 30px;">
                    <p style="font-size: 14px; font-weight: bold; color: #1f2937;">Is your account secure?</p>
                    <a href="${resetUrl}" style="display: inline-block; background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 10px;">Secure Account & Reset Password</a>
                </div>

                <p style="margin-top: 25px; font-size: 11px; color: #9ca3af; text-align: center;">
                    If this was you, you can safely ignore this email.
                </p>
            </div>
        `;

        await sendEmailWithSettings({
            to: user.email,
            subject,
            html,
            text: `Critical Security Alert: Failed login attempt detected for your account from ${ipAddress}.`
        }, organizationId);

        logger.info(`[ALERTS] Failed login alert sent for User: ${user.id}`);
    } catch (err) {
        logger.error(`[ALERTS] Failed login alert error: ${err.message}`);
    }
};

const checkExpiryAlert = async (batch) => {
    try {
        const organizationId = batch.organization_id;
        const setting = await Setting.findOne({
            where: { organization_id: organizationId, category: 'communication', branch_id: null }
        });

        if (!setting) return;

        const alerts = setting.settings_data?.email?.alerts;
        if (!alerts?.expiryAlert?.enabled) return;

        // Fetch details if not provided
        const product = await Product.findByPk(batch.product_id);
        const variant = batch.product_variant_id ? await ProductVariant.findByPk(batch.product_variant_id) : null;
        const organization = await Organization.findByPk(organizationId);

        const itemName = variant ? `${product.name} (${variant.name})` : product.name;
        const statusLabel = batch.expiration_status.toUpperCase();
        const color = batch.expiration_status === 'critical' ? '#d32f2f' : '#f57c00';

        const subject = `📅 Expiry Alert [${statusLabel}]: ${itemName}`;
        const html = `
            <div style="font-family: sans-serif; padding: 25px; border: 1px solid #eee; border-radius: 12px; max-width: 600px; margin: 0 auto;">
                <h2 style="color: ${color}; margin-top: 0;">Product Expiry Notification</h2>
                <p>An inventory batch has reached <strong>${statusLabel}</strong> status:</p>
                
                <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <tr><td style="padding: 8px 0; color: #666; width: 120px;">Product:</td><td style="font-weight: bold;">${itemName}</td></tr>
                        <tr><td style="padding: 8px 0; color: #666;">Batch #:</td><td style="font-weight: bold;">${batch.batch_number || 'N/A'}</td></tr>
                        <tr><td style="padding: 8px 0; color: #666;">Expiry Date:</td><td style="font-weight: bold; color: ${color};">${new Date(batch.expiry_date).toLocaleDateString()}</td></tr>
                        <tr><td style="padding: 8px 0; color: #666;">Current Qty:</td><td style="font-weight: bold;">${batch.quantity}</td></tr>
                    </table>
                </div>

                <p style="font-size: 13px; color: #4b5563;">Please take necessary action to move this stock before it expires.</p>
                <p style="margin-top: 30px; font-size: 11px; color: #9ca3af; border-top: 1px solid #eee; pt: 10px;">
                    Automated Alert from Inzeedo POS Monitoring System.
                </p>
            </div>
        `;

        await sendEmailWithSettings({
            to: organization.email,
            subject,
            html,
            text: `Expiry Alert: ${itemName} (Batch: ${batch.batch_number}) is ${statusLabel}. Expiry Date: ${new Date(batch.expiry_date).toLocaleDateString()}`
        }, organizationId);

        logger.info(`[ALERTS] Expiry alert sent for Org: ${organizationId}, Batch: ${batch.id}`);
    } catch (err) {
        logger.error(`[ALERTS] Failed to process expiry alert: ${err.message}`);
    }
};

module.exports = {
    checkLowStockAlert,
    checkHighSalesAlert,
    checkUnusualLoginActivity,
    checkFailedLoginAlert,
    checkExpiryAlert
};
