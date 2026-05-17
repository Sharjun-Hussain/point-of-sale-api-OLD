require('dotenv').config();
const db = require('../src/models');

async function run() {
  await db.sequelize.authenticate();
  console.log('Connected to development DB!');

  const org = await db.Organization.findOne({ where: { is_master: true } });
  console.log('Master Org ID:', org.id);

  const setting = await db.Setting.findOne({
      where: {
          organization_id: org.id,
          category: 'textlk_crm'
      }
  });

  if (setting) {
      console.log('Text.lk Settings found:');
      console.log(JSON.stringify(setting.settings_data, null, 2));
  } else {
      console.log('No Text.lk settings found for master organization in database.');
  }

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
