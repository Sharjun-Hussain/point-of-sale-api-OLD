async function run() {
  const token = '4869|z4iXuFgVzmCGUCok4suTHKDxVeqqMu6ppu0whS553ffe3f0d';
  const url = 'https://app.text.lk/api/v3/profile';

  console.log('Probing GET profile...');
  try {
      const res = await fetch(url, {
          headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
          }
      });
      const data = await res.json();
      console.log('Profile Response:', JSON.stringify(data, null, 2));
  } catch (err) {
      console.error('Error:', err.message);
  }

  process.exit(0);
}

run();
