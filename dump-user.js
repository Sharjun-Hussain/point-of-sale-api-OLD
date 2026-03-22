require('dotenv').config();
const { User, Organization } = require('./src/models');

async function test() {
    try {
        const user = await User.findOne({ where: { email: 'admin@emipos.com' }, include: [{ model: Organization, as: 'organization' }] });
        console.log("Admin user:", user.email, "Org ID:", user.organization_id);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
test();
