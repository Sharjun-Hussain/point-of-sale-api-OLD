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
            <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                <!-- Header section -->
                <div style="background-color: #0f172a; padding: 40px 30px; text-align: center;">
                    <div style="background: rgba(255,255,255,0.05); width: 56px; height: 56px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.1);">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                    </div>
                    <h1 style="color: #f8fafc; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.025em;">New Login Detected</h1>
                    <p style="color: #94a3b8; font-size: 14px; margin-top: 8px; margin-bottom: 0;">Security Alert</p>
                </div>
                
                <!-- Body section -->
                <div style="padding: 40px 30px;">
                    <p style="margin-top: 0; color: #0f172a; font-weight: 600; font-size: 15px;">Hello ${user.name},</p>
                    <p style="color: #475569; line-height: 1.6; font-size: 14px; margin-bottom: 30px;">We noticed a new login to your account. If this was you, you don't need to do anything. If not, please review the details below.</p>
                    
                    <div style="background-color: #f8fafc; padding: 0; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 30px; overflow: hidden;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px; font-weight: 600; width: 120px; background-color: #f1f5f9;">User</td>
                                <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; font-weight: 500; font-size: 14px; color: #0f172a;">${user.name} (${user.email})</td>
                            </tr>
                            <tr>
                                <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px; font-weight: 600; background-color: #f1f5f9;">IP Address</td>
                                <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #0f172a; font-size: 14px;">${ipAddress}</td>
                            </tr>
                            <tr>
                                <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px; font-weight: 600; background-color: #f1f5f9;">Device/Browser</td>
                                <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; font-weight: 500; color: #0f172a; font-size: 14px;">${userAgent}</td>
                            </tr>
                            <tr>
                                <td style="padding: 16px 20px; color: #64748b; font-size: 13px; font-weight: 600; background-color: #f1f5f9;">Time</td>
                                <td style="padding: 16px 20px; font-weight: 500; color: #0f172a; font-size: 14px;">${new Date().toUTCString()}</td>
                            </tr>
                        </table>
                    </div>

                    <div style="background-color: #fffbeb; padding: 16px 20px; border-radius: 6px; border-left: 4px solid #f59e0b;">
                        <p style="font-size: 13px; color: #b45309; margin: 0; line-height: 1.5;">
                            <strong>Action Required:</strong> If you did not authorize this login, please secure your account immediately by resetting your password.
                        </p>
                    </div>
                </div>
                
                <!-- Footer -->
                <div style="background-color: #f8fafc; padding: 24px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="font-size: 12px; color: #64748b; margin: 0; line-height: 1.5;">
                        This is an automated security notification from your SaaS platform.<br>
                        Please do not reply to this email.
                    </p>
                    <p style="font-size: 11px; color: #94a3b8; margin-top: 16px; margin-bottom: 0; text-transform: uppercase; letter-spacing: 0.05em;">
                        &copy; ${new Date().getFullYear()} Inzeedo POS Systems
                    </p>
                </div>
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
            <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                <!-- Header section -->
                <div style="background-color: #dc2626; padding: 40px 30px; text-align: center;">
                    <div style="background: rgba(255,255,255,0.1); width: 56px; height: 56px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.2);">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    </div>
                    <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.025em;">Failed Login Detected</h1>
                    <p style="color: #fecaca; font-size: 14px; margin-top: 8px; margin-bottom: 0;">Critical Security Alert</p>
                </div>
                
                <!-- Body section -->
                <div style="padding: 40px 30px;">
                    <p style="margin-top: 0; color: #0f172a; font-weight: 600; font-size: 15px;">Hello ${user.name},</p>
                    <p style="color: #475569; line-height: 1.6; font-size: 14px; margin-bottom: 30px;">An incorrect password was entered for your account. If this was not you, your account may be targeted by an unauthorized party.</p>
                    
                    <div style="background-color: #f8fafc; padding: 0; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 30px; overflow: hidden;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px; font-weight: 600; width: 120px; background-color: #f1f5f9;">IP Address</td>
                                <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #0f172a; font-size: 14px;">${ipAddress}</td>
                            </tr>
                            <tr>
                                <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px; font-weight: 600; background-color: #f1f5f9;">Device/Browser</td>
                                <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0; font-weight: 500; color: #0f172a; font-size: 14px;">${userAgent}</td>
                            </tr>
                            <tr>
                                <td style="padding: 16px 20px; color: #64748b; font-size: 13px; font-weight: 600; background-color: #f1f5f9;">Time</td>
                                <td style="padding: 16px 20px; font-weight: 500; color: #0f172a; font-size: 14px;">${new Date().toUTCString()}</td>
                            </tr>
                        </table>
                    </div>

                    <div style="text-align: center; margin-bottom: 30px;">
                        <a href="${resetUrl}" style="display: inline-block; background-color: #dc2626; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; transition: background-color 0.2s;">Secure Account & Reset Password &rarr;</a>
                    </div>

                    <p style="font-size: 12px; color: #64748b; text-align: center;">
                        If this was you attempting to log in and you simply forgot your password, you can use the button above to reset it.
                    </p>
                </div>
                
                <!-- Footer -->
                <div style="background-color: #f8fafc; padding: 24px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="font-size: 12px; color: #64748b; margin: 0; line-height: 1.5;">
                        This is an automated security notification from your SaaS platform.<br>
                        Please do not reply to this email.
                    </p>
                    <p style="font-size: 11px; color: #94a3b8; margin-top: 16px; margin-bottom: 0; text-transform: uppercase; letter-spacing: 0.05em;">
                        &copy; ${new Date().getFullYear()} Inzeedo POS Systems
                    </p>
                </div>
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
