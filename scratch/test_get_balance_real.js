require('dotenv').config();
const db = require('../src/models');
const textLkService = require('../src/services/textLkService');

async function run() {
  await db.sequelize.authenticate();
  console.log('Connected to development DB!');

  const org = await db.Organization.findOne({ where: { is_master: true } });
  
  try {
      const balanceData = await textLkService.getBalance(org.id);
      console.log('Balance Data fetched:');
      console.log(JSON.stringify(balanceData, null, 2));
  } catch (err) {
      console.error('Error fetching balance:', err.message);
  }

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
