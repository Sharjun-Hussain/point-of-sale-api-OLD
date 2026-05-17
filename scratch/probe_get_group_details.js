async function run() {
  const token = '4869|z4iXuFgVzmCGUCok4suTHKDxVeqqMu6ppu0whS553ffe3f0d';
  const groupId = '6a07f4cbebe24';
  
  const urls = [
      `https://app.text.lk/api/v3/contacts/group/${groupId}`,
      `https://app.text.lk/api/v3/contacts/groups/${groupId}`,
      `https://app.text.lk/api/v3/contacts/lists/${groupId}`
  ];

  for (const url of urls) {
      console.log(`\nProbing GET ${url}...`);
      try {
          const res = await fetch(url, {
              headers: {
                  'Authorization': `Bearer ${token}`,
                  'Accept': 'application/json'
              }
          });
          console.log('Status:', res.status);
          const data = await res.json();
          console.log('Response:', JSON.stringify(data, null, 2));
      } catch (err) {
          console.error('Error:', err.message);
      }
  }

  process.exit(0);
}

run();
