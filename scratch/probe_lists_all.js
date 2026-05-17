async function run() {
  const token = '4869|z4iXuFgVzmCGUCok4suTHKDxVeqqMu6ppu0whS553ffe3f0d';
  const groupId = '6a07f4cbebe24';
  
  const urls = [
      `https://app.text.lk/api/v3/contacts/lists/${groupId}/all`
  ];

  for (const url of urls) {
      console.log(`\nProbing POST ${url}...`);
      try {
          const res = await fetch(url, {
              method: 'POST',
              headers: {
                  'Authorization': `Bearer ${token}`,
                  'Accept': 'application/json'
              }
          });
          console.log('POST Status:', res.status);
          const data = await res.json();
          console.log('POST Response:', JSON.stringify(data, null, 2));
      } catch (err) {
          console.error('POST Error:', err.message);
      }

      console.log(`\nProbing GET ${url}...`);
      try {
          const res = await fetch(url, {
              method: 'GET',
              headers: {
                  'Authorization': `Bearer ${token}`,
                  'Accept': 'application/json'
              }
          });
          console.log('GET Status:', res.status);
          const data = await res.json();
          console.log('GET Response:', JSON.stringify(data, null, 2));
      } catch (err) {
          console.error('GET Error:', err.message);
      }
  }

  process.exit(0);
}

run();
