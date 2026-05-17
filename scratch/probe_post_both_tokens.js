async function run() {
  const token = '4869|z4iXuFgVzmCGUCok4suTHKDxVeqqMu6ppu0whS553ffe3f0d';
  const groupId = '6a07f4cbebe24';
  const url = `https://app.text.lk/api/v3/contacts/${groupId}/all?api_token=${token}`;

  console.log(`Probing POST ${url} with Authorization header...`);
  try {
      const res = await fetch(url, {
          method: 'POST',
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

  process.exit(0);
}

run();
