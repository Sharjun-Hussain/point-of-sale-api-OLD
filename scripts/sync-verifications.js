const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../src/models');

async function sync() {
    try {
        console.log('🔄 Syncing EmailVerification table...');
        await db.EmailVerification.sync({ alter: true });
        console.log('✅ EmailVerification table synced successfully.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Sync failed:', error);
        process.exit(1);
    }
}

sync();
