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

module.exports = {
    checkLowStockAlert,
    checkHighSalesAlert,
    checkUnusualLoginActivity
};
