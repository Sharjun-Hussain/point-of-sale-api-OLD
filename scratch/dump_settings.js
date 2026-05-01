const db = require('../src/models');
async function dump() {
    try {
        const settings = await db.Setting.findAll();
        console.log(JSON.stringify(settings, null, 2));
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
dump();
