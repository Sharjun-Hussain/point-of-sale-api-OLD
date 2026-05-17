async function run() {
  const token = '4869|z4iXuFgVzmCGUCok4suTHKDxVeqqMu6ppu0whS553ffe3f0d';
  const groupId = '6a07f4cbebe24';
  
  const params = [
      `group_id=${groupId}`,
      `group=${groupId}`,
      `contact_list_id=${groupId}`,
      `list_id=${groupId}`,
      `uid=${groupId}`
  ];

  for (const p of params) {
      const url = `https://app.text.lk/api/v3/contacts?${p}`;
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
