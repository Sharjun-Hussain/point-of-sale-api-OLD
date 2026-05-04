require('dotenv').config();
const path = require('path');
const { Setting, Organization } = require(path.resolve(__dirname, '../src/models'));
const { decrypt } = require(path.resolve(__dirname, '../src/utils/security'));

async function checkSettings() {
    try {
        const settings = await Setting.findAll({
            where: { category: 'communication' }
        });
        
        console.log(`Found ${settings.length} communication settings.`);
        
        for (const s of settings) {
            const org = await Organization.findByPk(s.organization_id);
            console.log(`\nOrganization: ${org?.name} (${s.organization_id})`);
            let data = s.settings_data;
            if (typeof data === 'string') {
                try { 
                    data = JSON.parse(data); 
                    if (typeof data === 'string') data = JSON.parse(data); 
                } catch(e) {
                    console.log('  Error parsing JSON');
                }
            }
            
            if (data?.email) {
                console.log(`  Provider: ${data.email.provider}`);
                console.log(`  Enabled: ${data.email.enabled}`);
                if (data.email.config) {
                    for (const key in data.email.config) {
                        try {
                            const val = decrypt(data.email.config[key]);
                            console.log(`  Config [${key}]: ${val}`);
                        } catch(e) {
                            console.log(`  Config [${key}]: [Encrypted/Error]`);
                        }
                    }
                }
            }
        }
    } catch (err) {
        console.error('DATABASE ERROR:', err.message);
    } finally {
        process.exit();
    }
}

checkSettings();
