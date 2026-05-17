async function run() {
  const token = '4869|z4iXuFgVzmCGUCok4suTHKDxVeqqMu6ppu0whS553ffe3f0d';
  const groupId = '6a07f4cbebe24';
  const url = `https://app.text.lk/api/v3/contacts/${groupId}/show`;

  console.log(`Probing POST ${url} with inclusion fields...`);
  
  const parameters = [
      { contacts: 1 },
      { contacts: true },
      { with_contacts: 1 },
      { with_contacts: true },
      { include: 'contacts' }
  ];

  for (const p of parameters) {
      console.log('Payload:', JSON.stringify(p));
      try {
          const res = await fetch(url, {
              method: 'POST',
              headers: {
                  'Authorization': `Bearer ${token}`,
                  'Accept': 'application/json',
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify(p)
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
