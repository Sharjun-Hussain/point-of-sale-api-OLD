// Quick script to manually activate organizations with Active subscription but is_active=false
const { Organization } = require('../models');

const fixActiveOrganizations = async () => {
    try {
        console.log('Fixing organizations with Active subscription but is_active=false...');

        const result = await Organization.update(
            { is_active: true },
            {
                where: {
                    subscription_status: 'Active',
                    is_active: false
                }
            }
        );

        console.log(`✅ Fixed ${result[0]} organizations.`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
};

// Run if called directly
if (require.main === module) {
    fixActiveOrganizations();
}

module.exports = { fixActiveOrganizations };
