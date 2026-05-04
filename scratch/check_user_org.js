require('dotenv').config();
const path = require('path');
const { User, Organization, Setting } = require(path.resolve(__dirname, '../src/models'));
const { decrypt } = require(path.resolve(__dirname, '../src/utils/security'));

async function checkUserOrg() {
    try {
        const userId = '37797e79-481e-4658-9b48-0b548cee3cb2';
        const user = await User.findByPk(userId);
        if (!user) {
            console.log('User not found');
            return;
        }
        console.log(`User: ${user.name} (${user.email})`);
        console.log(`Organization ID: ${user.organization_id}`);
        
        const org = await Organization.findByPk(user.organization_id);
        console.log(`Organization: ${org?.name}`);
        
        const setting = await Setting.findOne({
            where: { organization_id: user.organization_id, category: 'communication' }
        });
        
        if (setting) {
            console.log('Found communication settings in DB.');
            let data = setting.settings_data;
            if (typeof data === 'string') {
                try { data = JSON.parse(data); if (typeof data === 'string') data = JSON.parse(data); } catch(e) {}
            }
            console.log('Settings Data:', JSON.stringify(data, null, 2));
            if (data?.email?.config) {
                for (const key in data.email.config) {
                    try {
                        const val = decrypt(data.email.config[key]);
                        console.log(`  Config [${key}]: ${val}`);
                    } catch(e) {}
                }
            }
        } else {
            console.log('No communication settings found in DB for this organization.');
        }
        
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkUserOrg();
