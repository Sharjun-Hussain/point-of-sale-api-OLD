const cron = require('node-cron');
const { ProductBatch } = require('../models');
const { checkExpiryAlert } = require('../utils/alertManager');
const { Op, Sequelize } = require('sequelize');
const { addDays, startOfDay, endOfDay } = require('date-fns');

/**
 * Scheduled job to monitor product batch expirations
 * Categorizes batches into: normal, warning, critical, or expired
 * Runs daily at 00:05 AM
 */
const scheduleExpiryWatcher = async () => {
    const runExpiryCheck = async (isStartup = false) => {
        try {
            if (!isStartup) console.log('🔍 [EXPIRY WATCHER] Initializing Daily Inventory Health Scan...');
            const now = new Date();
            const today = startOfDay(now);
            const thirtyDays = endOfDay(addDays(today, 30));
            const ninetyDays = endOfDay(addDays(today, 90));

            let totalUpdated = 0;

            // 1. Mark 'Expired' (Date is in the past)
            const expiredBatches = await ProductBatch.findAll({
                where: {
                    expiry_date: { [Op.lt]: today },
                    quantity: { [Op.gt]: 0 },
                    expiration_status: { [Op.ne]: 'expired' }
                }
            });
            for (const batch of expiredBatches) {
                await batch.update({ expiration_status: 'expired' });
                await checkExpiryAlert(batch);
                totalUpdated++;
            }
            if (expiredBatches.length > 0 && !isStartup) console.log(`   🔴 Expired: Marked ${expiredBatches.length} batches as 'expired'.`);

            // 2. Mark 'Critical' (0 - 30 days remaining)
            const criticalBatches = await ProductBatch.findAll({
                where: {
                    expiry_date: {
                        [Op.and]: [
                            { [Op.gte]: today },
                            { [Op.lte]: thirtyDays }
                        ]
                    },
                    quantity: { [Op.gt]: 0 },
                    expiration_status: { [Op.ne]: 'critical' }
                }
            });
            for (const batch of criticalBatches) {
                await batch.update({ expiration_status: 'critical' });
                await checkExpiryAlert(batch);
                totalUpdated++;
            }
            if (criticalBatches.length > 0 && !isStartup) console.log(`   🟡 Critical: Marked ${criticalBatches.length} batches as 'critical' (< 30 days).`);

            // 3. Mark 'Warning' (31 - 90 days remaining)
            const warningBatches = await ProductBatch.findAll({
                where: {
                    expiry_date: {
                        [Op.and]: [
                            { [Op.gt]: thirtyDays },
                            { [Op.lte]: ninetyDays }
                        ]
                    },
                    quantity: { [Op.gt]: 0 },
                    expiration_status: { [Op.ne]: 'warning' }
                }
            });
            for (const batch of warningBatches) {
                await batch.update({ expiration_status: 'warning' });
                await checkExpiryAlert(batch);
                totalUpdated++;
            }
            if (warningBatches.length > 0 && !isStartup) console.log(`   🔵 Warning: Marked ${warningBatches.length} batches as 'warning' (< 90 days).`);

            // 4. Reset 'Normal' (If qty is 0 or date > 90 days)
            const [normalCount] = await ProductBatch.update(
                { expiration_status: 'normal' },
                {
                    where: {
                        [Op.or]: [
                            { expiry_date: { [Op.gt]: ninetyDays } },
                            { expiry_date: null },
                            { quantity: { [Op.lte]: 0 } }
                        ],
                        expiration_status: { [Op.ne]: 'normal' }
                    }
                }
            );
            totalUpdated += normalCount;

            if (isStartup) {
                console.log(`✓ [EXPIRY WATCHER] Startup check complete (${totalUpdated} batches re-indexed).`);
            } else {
                console.log(`✅ [EXPIRY WATCHER] Scan complete. Total batches re-indexed: ${totalUpdated}.`);
            }
        } catch (error) {
            console.error('❌ [EXPIRY WATCHER] Error during health scan:', error);
        }
    };

    // Immediate check on startup
    await runExpiryCheck(true);

    // Schedule daily check at 00:05 AM
    cron.schedule('5 0 * * *', async () => {
        await runExpiryCheck(false);
    });
};

module.exports = { scheduleExpiryWatcher };
