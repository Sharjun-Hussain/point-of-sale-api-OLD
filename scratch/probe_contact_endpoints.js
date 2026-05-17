async function run() {
  const token = '4869|z4iXuFgVzmCGUCok4suTHKDxVeqqMu6ppu0whS553ffe3f0d';
  const urls = [
      'https://app.text.lk/api/v3/contacts/6a07f4cbebe24/view',
      'https://app.text.lk/api/v3/contacts/6a07f4cbebe24/show',
      'https://app.text.lk/api/v3/contacts/view/6a07f4cbebe24',
      'https://app.text.lk/api/v3/contacts/show/6a07f4cbebe24'
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
