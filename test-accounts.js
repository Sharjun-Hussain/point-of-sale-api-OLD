require('dotenv').config();
const db = require('./src/models');
async function test() {
  const accounts = await db.Account.findAll({ 
    where: { type: 'expense' },
    order: [['organization_id', 'ASC'], ['code', 'ASC']],
    raw: true 
  });
  console.log("=== EXPENSE ACCOUNTS ===");
  accounts.forEach(a => {
    console.log(`Org: ${a.organization_id.substring(0,8)}... | Code: ${a.code} | Name: ${a.name} | Type: ${a.type}`);
  });
  process.exit(0);
}
test();
