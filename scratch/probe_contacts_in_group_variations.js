async function run() {
  const token = '4869|z4iXuFgVzmCGUCok4suTHKDxVeqqMu6ppu0whS553ffe3f0d';
  const groupId = '6a07f4cbebe24';
  
  const variations = [
      { url: `https://app.text.lk/api/v3/contacts/${groupId}/contacts`, method: 'GET' },
      { url: `https://app.text.lk/api/v3/contacts/${groupId}/contacts`, method: 'POST' },
      { url: `https://app.text.lk/api/v3/contacts/${groupId}`, method: 'GET' },
      { url: `https://app.text.lk/api/v3/contacts/${groupId}`, method: 'POST' }
  ];

  for (const v of variations) {
      console.log(`\nProbing ${v.method} ${v.url}...`);
      try {
          const res = await fetch(v.url, {
              method: v.method,
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
