async function run() {
  const token = '4869|z4iXuFgVzmCGUCok4suTHKDxVeqqMu6ppu0whS553ffe3f0d';
  const groupId = '6a07f4cbebe24';
  const url = `https://app.text.lk/api/v3/contacts/${groupId}/all`;

  console.log(`Probing POST ${url} with Form Data...`);
  
  // 1. Using FormData
  try {
      const formData = new FormData();
      // No extra fields, just empty form
      
      const res = await fetch(url, {
          method: 'POST',
          headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
          },
          body: formData
      });
      console.log('FormData Status:', res.status);
      const data = await res.json();
      console.log('FormData Response:', JSON.stringify(data, null, 2));
  } catch (err) {
      console.error('FormData Error:', err.message);
  }

  // 2. Using URL-encoded
  try {
      const res = await fetch(url, {
          method: 'POST',
          headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json',
              'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: ''
      });
      console.log('URLEncoded Status:', res.status);
      const data = await res.json();
      console.log('URLEncoded Response:', JSON.stringify(data, null, 2));
  } catch (err) {
      console.error('URLEncoded Error:', err.message);
  }

  process.exit(0);
}

run();
