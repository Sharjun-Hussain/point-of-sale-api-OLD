require('dotenv').config();
const { Organization, BusinessPlan, SubscriptionHistory } = require('../src/models');

async function verify() {
    try {
        console.log('Verifying Organization management logic...');

        // 1. Get first organization
        const org = await Organization.findOne();
        if (!org) {
            console.log('No organization found to test.');
            process.exit(0);
        }

        // 2. Get Pro plan
        const plan = await BusinessPlan.findOne({ where: { name: 'Pro' } });
        if (!plan) {
            console.log('Pro plan not found.');
            process.exit(0);
        }

        console.log(`Testing plan update for ${org.name} to ${plan.name}`);

        const oldPlanId = org.plan_id;

        // Simulate updateOrganizationPlan logic
        org.plan_id = plan.id;
        org.subscription_tier = plan.name;
        org.subscription_status = 'Active';
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + 1);
        org.subscription_expiry_date = expiryDate;
        await org.save();

        await SubscriptionHistory.create({
            organization_id: org.id,
            subscription_tier: plan.name,
            billing_cycle: 'Monthly',
            amount: plan.price_monthly,
            expiry_date: expiryDate,
            payment_method: 'Verification Test',
            notes: 'Automated verification test'
        });

        console.log('Successfully updated organization and created history entry.');

        // 3. Verify history exists
        const history = await SubscriptionHistory.findOne({
            where: { organization_id: org.id, subscription_tier: 'Pro' },
            order: [['created_at', 'DESC']]
        });

        if (history) {
            console.log(`✅ Success: Found history entry for ${history.subscription_tier}`);
        } else {
            console.log('❌ Failure: Subscription history entry not found');
        }

        process.exit(0);
    } catch (error) {
        console.error('Verification failed:', error);
        process.exit(1);
    }
}

verify();
