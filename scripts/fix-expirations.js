require('dotenv').config();
const { Organization, BusinessPlan } = require('../src/models');
const { Op } = require('sequelize');

async function fixExpirations() {
    try {
        console.log('Finding organizations with missing expiration dates...');

        const organizations = await Organization.findAll({
            where: {
                subscription_expiry_date: null
            },
            include: [{ model: BusinessPlan, as: 'plan' }]
        });

        console.log(`Found ${organizations.length} organizations to update.`);

        const now = new Date();
        const defaultExpiry = new Date();
        defaultExpiry.setDate(now.getDate() + 30); // Default 30 days from now

        let updatedCount = 0;
        for (const org of organizations) {
            let expiryDate = defaultExpiry;

            // If they have a plan with trial days, maybe use that from their creation date?
            // But simpler to just give them 30 days from now to ensure they show up in UI.
            if (org.plan && org.plan.trial_days) {
                const trialExpiry = new Date(org.created_at || now);
                trialExpiry.setDate(trialExpiry.getDate() + org.plan.trial_days);

                // If the trial calculated from creation is already in the past,
                // give them 14 days from now as a courtesy or just 30 days.
                if (trialExpiry < now) {
                    const courtesyExpiry = new Date();
                    courtesyExpiry.setDate(now.getDate() + 14);
                    expiryDate = courtesyExpiry;
                } else {
                    expiryDate = trialExpiry;
                }
            }

            org.subscription_expiry_date = expiryDate;
            if (!org.subscription_status) {
                org.subscription_status = 'Trial';
            }

            await org.save();
            updatedCount++;
            console.log(`Updated ${org.name}: New Expiry -> ${expiryDate.toISOString()}`);
        }

        console.log(`Successfully updated ${updatedCount} organizations.`);
        process.exit(0);
    } catch (error) {
        console.error('Error fixing expirations:', error);
        process.exit(1);
    }
}

fixExpirations();
