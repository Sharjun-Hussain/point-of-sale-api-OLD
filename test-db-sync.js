const { BusinessPlan } = require('./src/models');

async function test() {
    try {
        const plan = await BusinessPlan.create({
            name: 'Test Plan ' + Date.now(),
            trial_days: 14,
            max_branches: 1,
            max_users: 5,
            price_monthly: 9.99,
            price_yearly: 99.99,
            features: ['test_feature']
        });
        console.log('Success: Plan created with ID', plan.id);
        await plan.destroy();
        console.log('Success: Test plan cleaned up');
        process.exit(0);
    } catch (error) {
        console.error('Error creating plan:', error.message);
        process.exit(1);
    }
}

test();
