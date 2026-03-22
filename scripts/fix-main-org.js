require('dotenv').config();
const { Organization, BusinessPlan } = require('../src/models');

async function fixMainOrg() {
    try {
        console.log('Upgrading Main Organization to Permanent status...');

        // 1. Find the Main Organization
        const mainOrg = await Organization.findOne({
            where: { email: 'admin@emipos.com' }
        });

        if (!mainOrg) {
            console.error('❌ Main Organization (admin@emipos.com) not found.');
            process.exit(1);
        }

        // 2. Find Enterprise Plan (to link it)
        const enterprisePlan = await BusinessPlan.findOne({
            where: { name: 'Enterprise' }
        });

        // 3. Update settings
        mainOrg.subscription_tier = 'Enterprise';
        mainOrg.billing_cycle = 'Lifetime';
        mainOrg.subscription_status = 'Active';
        mainOrg.subscription_expiry_date = null; // Infinite

        if (enterprisePlan) {
            mainOrg.plan_id = enterprisePlan.id;
        }

        await mainOrg.save();

        console.log(`✅ Successfully upgraded ${mainOrg.name}:`);
        console.log(`- Plan: ${mainOrg.subscription_tier}`);
        console.log(`- Cycle: ${mainOrg.billing_cycle}`);
        console.log(`- Status: ${mainOrg.subscription_status}`);
        console.log(`- Expiry: Permanent (Null)`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Error upgrading Main Organization:', error);
        process.exit(1);
    }
}

fixMainOrg();
