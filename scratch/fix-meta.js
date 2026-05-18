require('dotenv').config();
const db = require('../src/models');

const fixMeta = async () => {
    try {
        console.log('Fixing SequelizeMeta...');
        await db.sequelize.authenticate();
        
        // We can execute raw query to insert into SequelizeMeta
        await db.sequelize.query(
            "INSERT INTO SequelizeMeta (name) VALUES ('20260517230000-add_accounting_enabled_to_organizations.js')"
        );
        console.log('Successfully registered migration: 20260517230000-add_accounting_enabled_to_organizations.js');
    } catch (err) {
        console.error('Error fixing SequelizeMeta (it might already be registered or failed):', err.message);
    } finally {
        process.exit();
    }
};

fixMeta();
