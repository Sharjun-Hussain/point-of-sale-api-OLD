const cron = require('node-cron');
const { ProductBatch } = require('../models');
const { Op, Sequelize } = require('sequelize');
const { addDays, startOfDay, endOfDay } = require('date-fns');

/**
 * Scheduled job to monitor product batch expirations
 * Categorizes batches into: normal, warning, critical, or expired
 * Runs daily at 00:05 AM
 */
const scheduleExpiryWatcher = async () => {
    
    const runExpiryCheck = async () => {
        try {
            console.log('🔍 [EXPIRY WATCHER] Initializing Daily Inventory Health Scan...');
            const now = new Date();
            const today = startOfDay(now);
            const thirtyDays = endOfDay(addDays(today, 30));
            const ninetyDays = endOfDay(addDays(today, 90));

            let totalUpdated = 0;

            // 1. Mark 'Expired' (Date is in the past)
            const [expiredCount] = await ProductBatch.update(
                { expiration_status: 'expired' },
                {
                    where: {
                        expiry_date: { [Op.lt]: today },
                        quantity: { [Op.gt]: 0 },
                        expiration_status: { [Op.ne]: 'expired' }
                    }
                }
            );
            totalUpdated += expiredCount;
            if (expiredCount > 0) console.log(`   🚨 Expired: Marked ${expiredCount} batches as 'expired'.`);

            // 2. Mark 'Critical' (0 - 30 days remaining)
            const [criticalCount] = await ProductBatch.update(
                { expiration_status: 'critical' },
                {
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
                }
            );
            totalUpdated += criticalCount;
            if (criticalCount > 0) console.log(`   🟡 Critical: Marked ${criticalCount} batches as 'critical' (< 30 days).`);

            // 3. Mark 'Warning' (31 - 90 days remaining)
            const [warningCount] = await ProductBatch.update(
                { expiration_status: 'warning' },
                {
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
                }
            );
            totalUpdated += warningCount;
            if (warningCount > 0) console.log(`   🔵 Warning: Marked ${warningCount} batches as 'warning' (< 90 days).`);

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

            console.log(`✅ [EXPIRY WATCHER] Scan complete. Total batches re-indexed: ${totalUpdated}.`);
        } catch (error) {
            console.error('❌ [EXPIRY WATCHER] Error during health scan:', error);
        }
    };

    // Immediate check on startup
    await runExpiryCheck();

    // Schedule daily check at 00:05 AM
    // Pattern: minute hour day-of-month month day-of-week
    cron.schedule('5 0 * * *', async () => {
        await runExpiryCheck();
    });

    console.log('✓ Product Expiry Watcher scheduled (runs daily at 00:05 AM)');
};

module.exports = { scheduleExpiryWatcher };
