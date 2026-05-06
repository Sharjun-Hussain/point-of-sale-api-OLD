require('dotenv').config();
const { Setting } = require('../src/models');
const db = require('../src/models');

async function fixShopifySettings() {
    try {
        const settings = await Setting.findAll({
            where: { category: 'shopify' }
        });

        for (const setting of settings) {
            let data = setting.settings_data;
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch (e) {}
            }
            console.log(`Checking org: ${setting.organization_id}, type of data now: ${typeof data}`);
            
            // Check if it's the "string-spread" corruption (object with numeric keys)
            if (data && typeof data === 'object' && (data['0'] !== undefined || data[0] !== undefined)) {
                console.log(`Found corrupted setting for org: ${setting.organization_id}`);
                console.log('Sample keys:', Object.keys(data).slice(0, 10));
                
                // Reconstruct the string from numeric keys
                const keys = Object.keys(data).filter(k => !isNaN(k)).sort((a, b) => Number(a) - Number(b));
                let jsonStr = keys.map(k => data[k]).join('');
                
                try {
                    const cleanData = JSON.parse(jsonStr);
                    console.log('Successfully parsed clean data:', cleanData.shop_url);
                    
                    await setting.update({ settings_data: cleanData });
                    console.log('Fixed!');
                } catch (e) {
                    console.error('Failed to parse reconstructed JSON:', e.message);
                    console.log('Raw string was:', jsonStr);
                }
            }
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fixShopifySettings();
