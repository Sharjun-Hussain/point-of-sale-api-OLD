const { Organization } = require('../models');
const { Op } = require('sequelize');

/**
 * Immediately check and expire subscriptions
 * Can be called manually or on-demand
 */
const expireSubscriptionsNow = async () => {
    try {
        console.log('Checking for expired subscriptions...');

        const now = new Date();

        // Find all organizations with expired subscriptions that are still active
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
            const results = await Promise.all(expiredOrgs.map(async (org) => {
                await org.update({
                    subscription_status: 'Expired',
                    is_active: false
                });
                return {
                    id: org.id,
                    name: org.name,
                    expiry_date: org.subscription_expiry_date
                };
            }));

            console.log(`✓ Successfully expired ${expiredOrgs.length} subscriptions.`);
            return results;
        } else {
            console.log('No expired subscriptions found.');
            return [];
        }
    } catch (error) {
        console.error('Error expiring subscriptions:', error);
        throw error;
    }
};

module.exports = { expireSubscriptionsNow };
