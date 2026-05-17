require('dotenv').config({ path: '.env.test' });
const db = require('../src/models');
const bcrypt = require('bcryptjs');

async function run() {
  await db.sequelize.authenticate();
  console.log('Connected!');

  // Drop and recreate schema
  await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  await db.User.destroy({ where: {} });
  await db.Role.destroy({ where: {} });
  await db.Organization.destroy({ where: {} });
  await db.Branch.destroy({ where: {} });
  await db.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

  const testOrg = await db.Organization.create({
      name: 'Text.lk Test Org',
      textlk_enabled: true
  });

  const testBranch = await db.Branch.create({
      organization_id: testOrg.id,
      name: 'Text.lk Test Branch',
      branch_code: 'TTB001'
  });

  const hashedPassword = await bcrypt.hash('password123', 10);
  console.log('hashedPassword:', hashedPassword);
  
  const testUser = await db.User.create({
      organization_id: testOrg.id,
      branch_id: testBranch.id,
      name: 'Text.lk Admin',
      username: 'lkadmin',
      email: 'lkadmin@example.com',
      password: hashedPassword
  });

  // Verify findOne
  const user = await db.User.findOne({
      where: { email: 'lkadmin@example.com' },
      include: [{ model: db.Organization, as: 'organization' }]
  });

  console.log('Found user:', !!user);
  if (user) {
    console.log('User password in DB:', user.password);
    const isMatch = await bcrypt.compare('password123', user.password);
    console.log('Password matches with bcryptjs:', isMatch);
  }

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
