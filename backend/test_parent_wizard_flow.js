'use strict';
/**
 * Test: Parent registration + child profile wizard API flow
 * Tests: login → profile_complete flag → /api/parent/children → care update → profile-complete
 */
const http = require('http');

const BASE = 'http://localhost:5000/api';

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 5000,
      path: '/api' + path, method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data ? Buffer.byteLength(data) : 0,
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
    };
    const r = http.request(opts, res => {
      let s = '';
      res.on('data', d => s += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(s) }); }
        catch { resolve({ status: res.statusCode, body: s }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function run() {
  let pass = 0, fail = 0;

  function check(label, cond, detail = '') {
    if (cond) { console.log(`  ✓ ${label}`); pass++; }
    else { console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); fail++; }
  }

  // ── Test 1: Admin login still works ───────────────────────────────────────
  console.log('\n[1] Admin login');
  const admin = await req('POST', '/auth/login', { email: 'admin@ankelba.dev', password: 'Admin@123!' });
  check('HTTP 200', admin.status === 200);
  check('Has token', !!admin.body.token);
  check('role=admin', admin.body.user?.role === 'admin');
  check('profile_complete present', admin.body.user?.profile_complete !== undefined, JSON.stringify(admin.body.user?.profile_complete));

  // ── Test 2: Parent login + profile_complete flag ───────────────────────────
  console.log('\n[2] Parent login — should have profile_complete=true (demo parent)');
  const p = await req('POST', '/auth/login', { email: 'parent@ankelba.dev', password: 'Parent@123!' });
  check('HTTP 200', p.status === 200, `Got ${p.status}`);
  check('Has token', !!p.body.token);
  check('role=parent', p.body.user?.role === 'parent');
  check('profile_complete=true', p.body.user?.profile_complete === true, JSON.stringify(p.body.user?.profile_complete));
  check('linked_children present', Array.isArray(p.body.user?.linked_children));
  const pToken = p.body.token;
  const firstChild = p.body.user?.linked_children?.[0];

  // ── Test 3: GET /api/parent/children ──────────────────────────────────────
  console.log('\n[3] GET /api/parent/children');
  const children = await req('GET', '/parent/children', null, pToken);
  check('HTTP 200', children.status === 200, `Got ${children.status}: ${JSON.stringify(children.body)}`);
  check('Returns children array', Array.isArray(children.body.children));
  const child = children.body.children?.[0];
  check('Has child', !!child, JSON.stringify(children.body.children));

  if (child) {
    // ── Test 4: GET /api/parent/children/:id ─────────────────────────────────
    console.log(`\n[4] GET /api/parent/children/${child.id}`);
    const childDetail = await req('GET', `/parent/children/${child.id}`, null, pToken);
    check('HTTP 200', childDetail.status === 200, `Got ${childDetail.status}`);
    check('Has care_instructions', Array.isArray(childDetail.body.child?.care_instructions));
    check('Has emergency_contacts', Array.isArray(childDetail.body.child?.emergency_contacts));

    // ── Test 5: GET versioned care profile ─────────────────────────────────────
    console.log(`\n[5] GET /api/parent/children/${child.id}/care-profile`);
    const cpGet = await req('GET', `/parent/children/${child.id}/care-profile`, null, pToken);
    check('HTTP 200', cpGet.status === 200, `Got ${cpGet.status}: ${JSON.stringify(cpGet.body)}`);
    check('Has version hash', typeof cpGet.body.version === 'string' && cpGet.body.version.length === 64);
    const version = cpGet.body.version;

    // ── Test 6: PATCH atomic care-profile (care + contacts + complete) ─────────
    console.log(`\n[6] PATCH /api/parent/children/${child.id}/care-profile`);
    const carePayload = {
      version,
      care_instructions: [
        { category: 'allergy', instruction_text: 'Peanut allergy — severe, use EpiPen' },
        { category: 'allergy', instruction_text: 'Dairy intolerance — causes stomach upset' },
        { category: 'medication', instruction_text: 'Cetirizine 5mg | Dosage: 1 tablet | When: After lunch daily' },
        { category: 'dietary', instruction_text: 'No spicy food. Prefers soft textures.' },
        { category: 'routine', instruction_text: 'Nap: 1 hour after lunch, sleeps on right side.' },
        { category: 'note', instruction_text: 'Comfort: Blue stuffed elephant named Ellie' },
      ],
      emergency_contacts: [
        { name: 'Almaz Bekele', relationship: 'Aunt', phone: '+251912345678' },
        { name: 'Tadesse Haile', relationship: 'Uncle', phone: '+251987654321' },
      ],
      complete_profile: true,
    };
    const cpSave = await req('PATCH', `/parent/children/${child.id}/care-profile`, carePayload, pToken);
    check('HTTP 200', cpSave.status === 200, `Got ${cpSave.status}: ${JSON.stringify(cpSave.body)}`);
    check('care_instructions saved', Array.isArray(cpSave.body.child?.care_instructions) && cpSave.body.child?.care_instructions?.length === 6);
    check('emergency_contacts saved', Array.isArray(cpSave.body.child?.emergency_contacts) && cpSave.body.child?.emergency_contacts?.length === 2);
    check('profile_complete=true in response', cpSave.body.parent?.profile_complete === true);

    // ── Test 7: Verify data was saved ─────────────────────────────────────────
    console.log(`\n[7] Verify data persisted — GET /api/parent/children/${child.id}`);
    const verify = await req('GET', `/parent/children/${child.id}`, null, pToken);
    check('care_instructions count=6', verify.body.child?.care_instructions?.length === 6, `Got ${verify.body.child?.care_instructions?.length}`);
    check('emergency_contacts count=2', verify.body.child?.emergency_contacts?.length === 2, `Got ${verify.body.child?.emergency_contacts?.length}`);
    check('allergy category present', verify.body.child?.child?.care_instructions?.some(c => c.category === 'allergy') || verify.body.child?.care_instructions?.some(c => c.category === 'allergy'));
  }

  // ── Test 8: Legacy endpoint returns 428 Precondition Required ────────────
  console.log('\n[8] Legacy endpoint returns 428 Precondition Required');
  const pcRes = await req('PATCH', '/parent/profile-complete', {}, pToken);
  check('HTTP 428', pcRes.status === 428, `Got ${pcRes.status}: ${JSON.stringify(pcRes.body)}`);

  // ── Test 9: Auth/me returns profile_complete ───────────────────────────────
  console.log('\n[9] GET /api/auth/me — profile_complete in response');
  const me = await req('GET', '/auth/me', null, pToken);
  check('HTTP 200', me.status === 200);
  check('profile_complete present in /me', me.body.user?.profile_complete !== undefined, JSON.stringify(me.body.user));

  // ── Test 10: RBAC — admin cannot hit /api/parent ──────────────────────────
  console.log('\n[10] RBAC — admin token rejected on /api/parent/children');
  const adminToken = admin.body.token;
  const rbac = await req('GET', '/parent/children', null, adminToken);
  check('Returns 403', rbac.status === 403, `Got ${rbac.status}`);

  // ─────────────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

run().catch(e => { console.error('Test error:', e.message); process.exit(1); });
