const API_URL = process.env.API_URL || 'http://localhost:31001';

export default async function globalSetup() {
  console.log(`\n  Global setup — API: ${API_URL}`);

  // Register admin user
  try {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@openmodel.studio', password: 'Test1234', name: 'Test User' }),
    });
    if (res.ok) console.log('  ✓ Admin user registered');
    else console.log(`  → Admin registration: ${res.status} (may already exist)`);
  } catch (e) {
    console.log(`  → Admin registration skipped: ${e}`);
  }

  // Verify login works
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@openmodel.studio', password: 'Test1234' }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.access_token) console.log('  ✓ Login verified — token received');
      else console.log('  ✗ Login response missing access_token:', JSON.stringify(data).slice(0, 100));
    } else {
      console.log(`  ✗ Login failed: ${res.status}`);
    }
  } catch (e) {
    console.log(`  ✗ Login verification failed: ${e}`);
  }

  console.log('  Global setup complete\n');
}
