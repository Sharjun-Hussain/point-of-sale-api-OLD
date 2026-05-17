async function run() {
  const token = '4869|z4iXuFgVzmCGUCok4suTHKDxVeqqMu6ppu0whS553ffe3f0d';
  const endpoints = [
      'https://app.text.lk/api/v3/contacts',
      'https://app.text.lk/api/v3/contacts/groups',
      'https://app.text.lk/api/v3/groups',
      'https://app.text.lk/api/v3/contact-groups'
  ];

  for (const url of endpoints) {
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
          console.log('Response:', JSON.stringify(data).slice(0, 500));
      } catch (err) {
          console.error('Error:', err.message);
      }
  }

  process.exit(0);
}

run();
