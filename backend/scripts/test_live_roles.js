const http = require('http');

async function testLogin(email, password, label) {
  const payload = JSON.stringify({ email, password });
  return new Promise(resolve => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const body = JSON.parse(data);
          if (res.statusCode === 200) {
            console.log(`✅ [${label}] Login OK (200) -> role: ${body.user?.role}, name: "${body.user?.name}", token: ${body.token ? 'Present' : 'None'}`);
          } else {
            console.log(`❌ [${label}] Login FAILED (${res.statusCode}) -> ${body.message || body.error}`);
          }
        } catch {
          console.log(`❌ [${label}] Login FAILED (${res.statusCode}) -> ${data}`);
        }
        resolve();
      });
    });
    req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  TESTING LIVE AUTHENTICATION FOR ALL SEEDED USER ROLES    ');
  console.log('═══════════════════════════════════════════════════════════');
  await testLogin('admin@ankelba.dev', 'Admin@123!', 'Daycare Admin (Director)');
  await testLogin('caregiver@ankelba.dev', 'Care@123!', 'Caregiver 1 (Toddlers)');
  await testLogin('caregiver2@ankelba.dev', 'Care@123!', 'Caregiver 2 (Pre-K)');
  await testLogin('parent@ankelba.dev', 'Parent@123!', 'Parent 1 (Hana Tesfaye)');
  await testLogin('parent2@ankelba.dev', 'Parent@123!', 'Parent 2 (Dawit Kebede)');
  await testLogin('parent@gmail.com', '1234', 'Quick Demo Parent');
  await testLogin('superadmin@ankelba.com', 'SuperAdmin@123!', 'Platform Super Admin');
  console.log('═══════════════════════════════════════════════════════════');
}

run();
