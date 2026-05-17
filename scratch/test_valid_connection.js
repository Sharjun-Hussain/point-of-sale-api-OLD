const textLkService = require('../src/services/textLkService');

async function run() {
  const token = '4869|z4iXuFgVzmCGUCok4suTHKDxVeqqMu6ppu0whS553ffe3f0d';
  console.log('Testing connection with token:', token);
  
  const result = await textLkService.verifyConnection({ apiKey: token });
  console.log('Connection Verification Result:', JSON.stringify(result, null, 2));

  if (result.success) {
      console.log('\nFetching real balance...');
      try {
          const balanceRes = await fetch('https://app.text.lk/api/v3/balance', {
              headers: {
                  'Authorization': `Bearer ${token}`,
                  'Accept': 'application/json'
              }
          });
          const balanceData = await balanceRes.json();
          console.log('Real Balance Response:', JSON.stringify(balanceData, null, 2));
      } catch (err) {
          console.error('Balance Fetch Error:', err.message);
      }
  }

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
