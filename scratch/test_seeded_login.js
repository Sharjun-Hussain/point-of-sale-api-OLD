require('dotenv').config();
const db = require('../src/models');
const bcrypt = require('bcryptjs');

async function run() {
  await db.sequelize.authenticate();
  console.log('Connected!');

  const user = await db.User.findOne({
      where: { email: 'mrjoon005@gmail.com' }
  });

  if (!user) {
      console.log('User not found!');
      process.exit(1);
  }

  const match = await bcrypt.compare('Inzeedo@99', user.password);
  console.log('Password matches with bcryptjs:', match);

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
