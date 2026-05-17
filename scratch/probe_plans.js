const { Sequelize } = require('sequelize');

async function run() {
  const sequelize = new Sequelize('pos_system', 'root', '1234', {
    host: 'localhost',
    dialect: 'mysql',
    logging: false
  });

  try {
      await sequelize.authenticate();
      console.log('Database connected successfully.');

      const [plans] = await sequelize.query('SELECT * FROM business_plans');
      console.log('\nBusiness Plans:');
      console.log(JSON.stringify(plans, null, 2));
  } catch (err) {
      console.error('Error:', err.message);
  } finally {
      await sequelize.close();
  }
}

run();
