const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: process.env.DB_DIALECT,
    logging: console.log,
  }
);

async function cleanupIndexes(tableName) {
  try {
    const [results] = await sequelize.query(`SHOW INDEX FROM ${tableName}`);
    const indexesToDrop = results
      .filter(idx => idx.Key_name.match(/_(2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20)$/))
      .map(idx => idx.Key_name);

    console.log(`[CLEANUP] Found ${indexesToDrop.length} redundant indexes on ${tableName}`);
    
    for (const idxName of indexesToDrop) {
      console.log(`[CLEANUP] Dropping ${idxName}...`);
      await sequelize.query(`ALTER TABLE ${tableName} DROP INDEX ${idxName}`);
    }
    
    console.log(`[CLEANUP] Finished cleaning ${tableName}`);
  } catch (error) {
    console.error(`[CLEANUP] Error cleaning ${tableName}:`, error.message);
  }
}

async function run() {
  const tables = ['products', 'containers', 'grns', 'customers', 'business_plans', 'distributors'];
  for (const table of tables) {
    await cleanupIndexes(table);
  }
  process.exit(0);
}

run();
