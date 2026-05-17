async function run() {
  const token = '4869|z4iXuFgVzmCGUCok4suTHKDxVeqqMu6ppu0whS553ffe3f0d';
  const url = 'https://app.text.lk/api/v3/contacts/6a07f4cbebe24';

  try {
      const res = await fetch(url, {
          headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
          }
      });
      const data = await res.json();
      console.log('Single Contact Response Data:');
      console.log(JSON.stringify(data, null, 2));
  } catch (err) {
      console.error('Error:', err.message);
  }

  process.exit(0);
}

run();
