require('dotenv').config();
const db = require('../src/models');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../server');

async function run() {
  await db.sequelize.authenticate();
  console.log('Connected to development DB!');

  const user = await db.User.findOne({
      where: { email: 'mrjoon005@gmail.com' }
  });

  const token = jwt.sign(
      { id: user.id, email: user.email, organization_id: user.organization_id },
      process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
      { expiresIn: '2h' }
  );

  console.log('Generated JWT Token for test request.');

  const res = await request(app)
      .get('/api/v1/crm/text-lk/stats')
      .set('Authorization', `Bearer ${token}`);

  console.log('\n--- GET /api/v1/crm/text-lk/stats response ---');
  console.log('Status Code:', res.status);
  console.log('Body:', JSON.stringify(res.body, null, 2));

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
