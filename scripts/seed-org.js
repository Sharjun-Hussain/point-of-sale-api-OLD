require('dotenv').config();
const db = require('../src/models');
const seederService = require('../src/services/seederService');

/**
 * CLI Script to seed a specific organization with default data
 * Usage: node scripts/seed-org.js <organization_id>
 */
async function run() {
    const orgId = process.argv[2];

    if (!orgId) {
        console.error('❌ Error: Please provide an organization ID.');
        console.log('Usage: node scripts/seed-org.js <organization_id>');
        process.exit(1);
    }

    try {
        // Verify organization exists
        const org = await db.Organization.findByPk(orgId);
        if (!org) {
            console.error(`❌ Error: Organization with ID [${orgId}] not found.`);
            process.exit(1);
        }

        console.log(`🚀 Starting seed for organization: ${org.name} (${org.id})`);
        await seederService.seedAllDefaults(orgId);
        
        console.log('✨ Seeding completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}

run();
