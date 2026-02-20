require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api/v1';

async function testRotation() {
    console.log('--- Testing Refresh Token Rotation ---');

    try {
        // 1. Login
        console.log('\n1. Logging in...');
        const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'admin@igen.com',
            password: 'password123'
        });

        const { auth_token, refresh_token } = loginRes.data.data;
        console.log('✅ Login successful');
        console.log('Refresh Token:', refresh_token ? 'Received' : 'MISSING');

        // 2. Refresh
        console.log('\n2. Refreshing token...');
        const refreshRes = await axios.post(`${BASE_URL}/auth/refresh`, {
            refresh_token: refresh_token
        });

        const newTokens = refreshRes.data.data;
        console.log('✅ Refresh successful');
        console.log('New Refresh Token:', newTokens.refresh_token ? 'Received' : 'MISSING');

        // 3. Try to use OLD refresh token (Reuse Detection)
        console.log('\n3. Testing reuse of old refresh token (should fail)...');
        try {
            await axios.post(`${BASE_URL}/auth/refresh`, {
                refresh_token: refresh_token
            });
            console.log('❌ Error: Old token should have been rotated/deleted');
        } catch (err) {
            if (err.response && err.response.status === 401) {
                console.log('✅ Success: Received 401 as expected');
            } else {
                console.log('❌ Error: Expected 401 but got', err.response ? err.response.status : 'no response');
            }
        }

        // 4. Logout with new token
        console.log('\n4. Logging out...');
        await axios.post(`${BASE_URL}/auth/logout`, {
            refresh_token: newTokens.refresh_token
        });
        console.log('✅ Logout successful');

        // 5. Try to refresh after logout
        console.log('\n5. Testing refresh after logout (should fail)...');
        try {
            await axios.post(`${BASE_URL}/auth/refresh`, {
                refresh_token: newTokens.refresh_token
            });
            console.log('❌ Error: Token should have been revoked');
        } catch (err) {
            if (err.response && err.response.status === 401) {
                console.log('✅ Success: Received 401 as expected');
            } else {
                console.log('❌ Error: Expected 401 but got', err.response ? err.response.status : 'no response');
            }
        }

    } catch (error) {
        console.error('❌ Test failed:', error.response ? error.response.data : error.message);
    }
}

testRotation();
