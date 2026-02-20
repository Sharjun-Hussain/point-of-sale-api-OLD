const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api/v1';

async function testValidation() {
    console.log('--- Testing Auth Input Validation ---');

    // 1. Test Login with invalid data
    try {
        console.log('\nTesting Login with invalid email and empty password...');
        await axios.post(`${BASE_URL}/login`, {
            email: 'invalid-email',
            password: ''
        });
        console.log('❌ Error: Request should have been rejected');
    } catch (error) {
        if (error.response && error.response.status === 400) {
            console.log('✅ Success: Received 400 Validation Error');
            console.log('Errors:', JSON.stringify(error.response.data.errors, null, 2));
        } else {
            console.log('❌ Error: Expected 400 but got', error.response ? error.response.status : 'no response');
        }
    }

    // 2. Test Register with short password
    try {
        console.log('\nTesting Register with short password...');
        await axios.post(`${BASE_URL}/register`, {
            name: 'John Doe',
            email: 'john@example.com',
            password: '123'
        });
        console.log('❌ Error: Request should have been rejected');
    } catch (error) {
        if (error.response && error.response.status === 400) {
            console.log('✅ Success: Received 400 Validation Error');
            console.log('Errors:', JSON.stringify(error.response.data.errors, null, 2));
        } else {
            console.log('❌ Error: Expected 400 but got', error.response ? error.response.status : 'no response');
        }
    }
}

testValidation();
