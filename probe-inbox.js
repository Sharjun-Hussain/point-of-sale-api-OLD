require('dotenv').config();
const axios = require('axios');
const { Setting } = require('./src/models');
const { decrypt } = require('./src/utils/security');

async function probeInbox() {
    try {
        const setting = await Setting.findOne({ where: { category: 'whatsapp_crm' } });
        if (!setting) { process.exit(1); }
        
        let data = setting.settings_data;
        if (typeof data === 'string') data = JSON.parse(data);
        
        const apiKey = decrypt(data.apiKey);
        let { apiUrl, accountId, inboxId } = data;
        if (!apiUrl.startsWith('http')) apiUrl = `https://${apiUrl}`;
        
        const client = axios.create({
            baseURL: `${apiUrl}/api/v1/accounts/${accountId}`,
            headers: { 'api_access_token': apiKey }
        });

        console.log('Base URL:', client.defaults.baseURL);

        console.log('--- FETCHING INBOX DETAILS ---');
        const res = await client.get(`/inboxes/${inboxId}`);
        console.log(JSON.stringify(res.data, null, 2));

        console.log('--- FETCHING WHATSAPP TEMPLATES ENDPOINT ---');
        try {
            const res2 = await client.get(`/inboxes/${inboxId}/whatsapp_templates`);
            console.log(JSON.stringify(res2.data, null, 2));
        } catch (e) { console.log('Endpoint failed:', e.message); }

        process.exit(0);
    } catch (error) {
        console.error('Probe error:', error.message);
        process.exit(1);
    }
}

probeInbox();
