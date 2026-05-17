require('dotenv').config();
const db = require('../src/models');

async function run() {
  await db.sequelize.authenticate();
  console.log('Connected to development DB!');

  const users = await db.User.findAll({
      attributes: ['id', 'name', 'email', 'is_active'],
      include: [{
          model: db.Organization,
          as: 'organization',
          attributes: ['id', 'name', 'is_active']
      }]
  });

  console.log('\n--- REGISTERED USERS ---');
  users.forEach(u => {
    console.log(`- Email: ${u.email}`);
    console.log(`  Name: ${u.name}`);
    console.log(`  Active: ${u.is_active}`);
    console.log(`  Organization: ${u.organization ? u.organization.name : 'None'} (Active: ${u.organization ? u.organization.is_active : 'N/A'})`);
    console.log('------------------------');
  });

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
