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

const migrationName = '20260509185000-final_multi_tenant_hardening.js';
const migrationPath = path.resolve(__dirname, '../migrations', migrationName);
const migration = require(migrationPath);

async function run() {
  try {
    const queryInterface = sequelize.getQueryInterface();
    
    console.log(`[MIGRATOR] Running migration: ${migrationName}...`);
    await migration.up(queryInterface, Sequelize);
    
    // Mark as completed in SequelizeMeta
    await sequelize.query(
      "INSERT INTO SequelizeMeta (name) VALUES (:name)",
      { 
        replacements: { name: migrationName },
        type: Sequelize.QueryTypes.INSERT 
      }
    );
    
    console.log(`[MIGRATOR] Successfully applied ${migrationName}`);
    process.exit(0);
  } catch (error) {
    console.error(`[MIGRATOR] Migration failed:`, error);
    process.exit(1);
  }
}

run();
