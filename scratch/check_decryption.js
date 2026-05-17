require('dotenv').config();
const db = require('../src/models');
const textLkService = require('../src/services/textLkService');

async function run() {
  await db.sequelize.authenticate();
  console.log('Connected to development DB!');

  const org = await db.Organization.findOne({ where: { is_master: true } });
  console.log('Master Org ID:', org.id);

  const config = await textLkService._getFullConfig(org.id);
  console.log('Config loaded from DB:');
  console.log(JSON.stringify(config, null, 2));

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
