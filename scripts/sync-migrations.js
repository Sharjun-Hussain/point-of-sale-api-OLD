require('dotenv').config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });
const db = require('../src/models');
const fs = require('fs');
const path = require('path');

async function syncMigrations() {
    try {
        console.log('🔄 Checking database connection...');
        await db.sequelize.authenticate();
        console.log('✅ Connection established.');

        // 1. Ensure SequelizeMeta table exists
        await db.sequelize.query(`
            CREATE TABLE IF NOT EXISTS \`SequelizeMeta\` (
                \`name\` VARCHAR(255) NOT NULL,
                PRIMARY KEY (\`name\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
        `);
        console.log('✅ SequelizeMeta table ensured.');

        // 2. Read all migration files
        const migrationsDir = path.join(__dirname, '../migrations');
        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.js'))
            .sort();

        // 3. Get already executed migrations
        const [executed] = await db.sequelize.query('SELECT name FROM SequelizeMeta');
        const executedNames = executed.map(row => row.name);

        console.log(`📂 Total migrations in folder: ${files.length}`);
        console.log(`📊 Migrations already in SequelizeMeta: ${executedNames.length}`);

        // 4. Insert previous migrations to SequelizeMeta
        let insertedCount = 0;
        for (const file of files) {
            // Do NOT mark the new migration as executed so that we can run it through db:migrate normally
            if (file === '20260517230000-add_accounting_enabled_to_organizations.js') {
                continue;
            }

            if (!executedNames.includes(file)) {
                await db.sequelize.query('INSERT INTO SequelizeMeta (name) VALUES (?)', {
                    replacements: [file]
                });
                insertedCount++;
                console.log(`   ➕ Marked as executed: ${file}`);
            }
        }

        console.log(`\n🎉 Success! Synchronized ${insertedCount} migrations in SequelizeMeta.`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Failed to sync migrations:', err);
        process.exit(1);
    }
}

syncMigrations();
