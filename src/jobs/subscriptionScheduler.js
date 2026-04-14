const cron = require('node-cron');
const { Organization } = require('../models');
const { Op } = require('sequelize');

/**
 * Scheduled job to check and expire subscriptions daily
 * Runs every day at midnight (00:00)
 * Also runs immediately on startup
 */
const scheduleSubscriptionCheck = async () => {
    // Immediate check on startup
    try {
        const now = new Date();

        const expiredOrgs = await Organization.findAll({
            where: {
                subscription_expiry_date: { [Op.lt]: now },
                subscription_status: { [Op.in]: ['Active', 'Trial'] }
            }
        });

        if (expiredOrgs.length > 0) {
            await Promise.all(expiredOrgs.map(async (org) => {
                await org.update({ subscription_status: 'Expired', is_active: false });
            }));
            console.log(`⚠️  [SUBS_CHECK] Startup: Auto-expired ${expiredOrgs.length} organizations.`);
        } else {
            console.log('✓ [SUBS_CHECK] Startup: No expired subscriptions detected.');
        }
    } catch (error) {
        console.error('❌ [SUBS_CHECK] Startup Error:', error.message);
    }

    // Schedule daily check at midnight
    cron.schedule('0 0 * * *', async () => {
        // (Existing daily logic remains intact)
        try {
            const now = new Date();
            const expiredOrgs = await Organization.findAll({
                where: {
                    subscription_expiry_date: { [Op.lt]: now },
                    subscription_status: { [Op.in]: ['Active', 'Trial'] }
                }
            });

            if (expiredOrgs.length > 0) {
                await Promise.all(expiredOrgs.map(async (org) => {
                    await org.update({ subscription_status: 'Expired', is_active: false });
                }));
                console.log(`[SUBS_CHECK] Scheduled: Expired ${expiredOrgs.length} orgs.`);
            }
        } catch (error) {
            console.error('[SUBS_CHECK] Scheduled Error:', error);
        }
    });
};

module.exports = { scheduleSubscriptionCheck };
