const cron = require('node-cron');
const { Setting, Stock, Product, ProductVariant, Organization, Branch, sequelize } = require('../models');
const { Op } = require('sequelize');
const { sendEmailWithSettings } = require('../utils/mailer');
const logger = require('../utils/logger');

/**
 * Scheduled job to scan for low stock items across all organizations
 * Runs daily at 08:30 AM
 */
const scheduleInventoryWatcher = async () => {
    const runInventoryScan = async (isStartup = false) => {
        try {
            if (!isStartup) logger.info('🔍 [INVENTORY WATCHER] Initializing Daily Low Stock Scan...');
            
            // 1. Fetch all organizations
            const organizations = await Organization.findAll({
                where: { is_active: true },
                attributes: ['id', 'name', 'email', 'currency']
            });

            for (const org of organizations) {
                // 2. Check if low stock alerts are enabled for this org
                const setting = await Setting.findOne({
                    where: { organization_id: org.id, category: 'communication', branch_id: null }
                });

                if (!setting) continue;

                const alerts = setting.settings_data?.email?.alerts;
                if (!alerts?.lowStock?.enabled) continue;

                const threshold = alerts.lowStock.threshold || 10;

                // 3. Find all items below threshold for this org
                const lowStockItems = await Stock.findAll({
                    where: {
                        organization_id: org.id,
                        quantity: { [Op.lte]: threshold }
                    },
                    include: [
                        { model: Product, as: 'product', attributes: ['name', 'code'] },
                        { model: ProductVariant, as: 'variant', attributes: ['name', 'sku'] },
                        { model: Branch, as: 'branch', attributes: ['name'] }
                    ]
                });

                if (lowStockItems.length > 0) {
                    // 4. Generate Summary Email
                    const subject = `📊 Daily Inventory Report: ${lowStockItems.length} Items Low on Stock`;
                    
                    let tableRows = '';
                    lowStockItems.forEach(item => {
                        const itemName = item.variant ? `${item.product.name} (${item.variant.name})` : item.product.name;
                        const code = item.variant?.sku || item.product.code || 'N/A';
                        tableRows += `
                            <tr>
                                <td style="padding: 10px; border: 1px solid #eee;">${itemName}</td>
                                <td style="padding: 10px; border: 1px solid #eee;">${code}</td>
                                <td style="padding: 10px; border: 1px solid #eee; text-align: center; color: #d32f2f; font-weight: bold;">${item.quantity}</td>
                                <td style="padding: 10px; border: 1px solid #eee; text-align: center;">${item.branch.name}</td>
                            </tr>
                        `;
                    });

                    const html = `
                        <div style="font-family: sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; border: 1px solid #f0f0f0; border-radius: 12px;">
                            <h2 style="color: #1e293b;">Daily Inventory Scan</h2>
                            <p style="color: #64748b;">The following items have fallen below your reorder threshold (<b>${threshold} units</b>):</p>
                            
                            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                                <thead>
                                    <tr style="background-color: #f8fafc;">
                                        <th style="padding: 12px; border: 1px solid #eee; text-align: left;">Item Name</th>
                                        <th style="padding: 12px; border: 1px solid #eee; text-align: left;">SKU/Code</th>
                                        <th style="padding: 12px; border: 1px solid #eee; text-align: center;">Current Qty</th>
                                        <th style="padding: 12px; border: 1px solid #eee; text-align: center;">Branch</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${tableRows}
                                </tbody>
                            </table>
                            
                            <div style="margin-top: 30px; padding: 15px; background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; color: #92400e; font-size: 13px;">
                                💡 <b>Pro-tip:</b> Ensure you replenish stock soon to avoid business interruption.
                            </div>
                            
                            <p style="margin-top: 25px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; pt-15px;">
                                This is an automated daily audit from Inzeedo POS Systems. 
                                <br/>Timestamp: ${new Date().toUTCString()}
                            </p>
                        </div>
                    `;

                    // Send the summary email
                    await sendEmailWithSettings({
                        to: org.email,
                        subject,
                        html,
                        text: `Inventory Report: ${lowStockItems.length} items are below threshold.`
                    }, org.id);
                    
                    if (!isStartup) logger.info(`   ✅ Sent low stock summary to ${org.name} (${lowStockItems.length} items)`);
                }
            }

        } catch (error) {
            logger.error('❌ [INVENTORY WATCHER] Error during inventory scan:', error);
        }
    };

    // Schedule daily check at 08:30 AM
    cron.schedule('30 8 * * *', async () => {
        await runInventoryScan(false);
    });

    if (process.env.NODE_ENV === 'development') {
        // Run once on startup in dev for testing
        // await runInventoryScan(true); 
    }
};

module.exports = { scheduleInventoryWatcher };
