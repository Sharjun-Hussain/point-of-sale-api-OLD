require('dotenv').config({ path: __dirname + '/../.env' });
const { Organization, BusinessPlan } = require('../src/models');

async function diagnose() {
    try {
        const orgs = await Organization.findAll({
            where: {
                accounting_enabled: false
            },
            include: [{ model: BusinessPlan, as: 'plan' }]
        });

        console.log(`Found ${orgs.length} organizations with accounting_enabled = false`);
        orgs.forEach(org => {
            console.log(`- Org: ${org.name} (Tier: ${org.subscription_tier})`);
        });
        
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

diagnose();
