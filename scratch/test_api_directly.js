

async function run() {
  const url = 'https://app.text.lk/api/v3/contacts?limit=1';
  console.log('Probing with invalid API key...');
  try {
      const response = await fetch(url, {
          headers: {
              'Authorization': 'Bearer garbage_key_123',
              'Accept': 'application/json'
          }
      });
      console.log('Response Status:', response.status);
      console.log('Response OK:', response.ok);
      const data = await response.json();
      console.log('Response Body:', JSON.stringify(data, null, 2));
  } catch (err) {
      console.error('Error:', err.message);
  }
}

run();
