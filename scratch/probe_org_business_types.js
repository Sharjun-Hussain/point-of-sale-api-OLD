const { Sequelize, DataTypes } = require('sequelize');

async function run() {
  const sequelize = new Sequelize('pos_system', 'root', '1234', {
    host: 'localhost',
    dialect: 'mysql',
    logging: false
  });

  try {
      await sequelize.authenticate();
      console.log('Database connected successfully.');

      const [orgs] = await sequelize.query('SELECT id, name, email, business_type, subscription_tier FROM organizations');
      console.log('\nOrganizations:');
      console.log(JSON.stringify(orgs, null, 2));
  } catch (err) {
      console.error('Error:', err.message);
  } finally {
      await sequelize.close();
  }
}

run();
