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
        console.log('🔍 Running immediate subscription expiry check on startup...');

        const now = new Date();

        const expiredOrgs = await Organization.findAll({
            where: {
                subscription_expiry_date: {
                    [Op.lt]: now
                },
                subscription_status: {
                    [Op.in]: ['Active', 'Trial']
                }
            }
        });

        if (expiredOrgs.length > 0) {
            console.log(`⚠️  Found ${expiredOrgs.length} expired subscriptions on startup!`);

            await Promise.all(expiredOrgs.map(async (org) => {
                await org.update({
                    subscription_status: 'Expired',
                    is_active: false
                });
                console.log(`   ✓ Expired: "${org.name}" (Expiry: ${org.subscription_expiry_date.toLocaleDateString()})`);
            }));

            console.log(`✅ Successfully expired ${expiredOrgs.length} past-due subscriptions.`);
        } else {
            console.log('✅ No expired subscriptions found on startup.');
        }
    } catch (error) {
        console.error('❌ Error in startup subscription check:', error);
    }

    // Schedule daily check at midnight
    cron.schedule('0 0 * * *', async () => {
        try {
            console.log('Running scheduled subscription expiry check...');

            const now = new Date();

            // Find all organizations with expired subscriptions
            const expiredOrgs = await Organization.findAll({
                where: {
                    subscription_expiry_date: {
                        [Op.lt]: now
                    },
                    subscription_status: {
                        [Op.in]: ['Active', 'Trial']
                    }
                }
            });

            if (expiredOrgs.length > 0) {
                console.log(`Found ${expiredOrgs.length} expired subscriptions. Updating...`);

                // Update all expired organizations
                await Promise.all(expiredOrgs.map(async (org) => {
                    await org.update({
                        subscription_status: 'Expired',
                        is_active: false
                    });
                    console.log(`✓ Organization "${org.name}" (${org.id}) subscription expired and suspended.`);
                }));

                console.log(`Successfully updated ${expiredOrgs.length} expired subscriptions.`);
            } else {
                console.log('No expired subscriptions found.');
            }
        } catch (error) {
            console.error('Error in subscription expiry check:', error);
        }
    });

    console.log('✓ Subscription expiry check scheduled (runs daily at midnight)');
};

module.exports = { scheduleSubscriptionCheck };
