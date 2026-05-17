async function run() {
  const token = '4869|z4iXuFgVzmCGUCok4suTHKDxVeqqMu6ppu0whS553ffe3f0d';
  const groupId = '6a07f4cbebe24';
  
  const probes = [
      { url: `https://app.text.lk/api/v3/contacts/${groupId}/contacts/all`, method: 'POST' },
      { url: `https://app.text.lk/api/v3/contacts/${groupId}/contacts/all`, method: 'GET' },
      { url: `https://app.text.lk/api/v3/contacts/${groupId}/all-contacts`, method: 'POST' },
      { url: `https://app.text.lk/api/v3/contacts/${groupId}/all-contacts`, method: 'GET' }
  ];

  for (const p of probes) {
      console.log(`\nProbing ${p.method} ${p.url}...`);
      try {
          const res = await fetch(p.url, {
              method: p.method,
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
