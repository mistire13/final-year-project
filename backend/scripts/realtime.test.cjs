'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const WebSocket = require('ws');
const { createHub, buildMessageEvent } = require('../src/modules/realtime/hub');
const { resourceForMutation } = require('../src/modules/realtime/resource-invalidation');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('message invalidations never include message or health record contents', () => {
  const row = { id: 7, sender_id: 2, recipient_id: 1, subject: 'Private subject', body: 'Private medical details', push_event_type: 'health' };
  assert.deepEqual(buildMessageEvent(row, 'message.changed'), {
    type: 'message.changed', messageId: 7, senderId: 2, recipientId: 1, notificationKind: 'health',
  });
  assert.deepEqual(buildMessageEvent({ ...row, push_event_type: null }, 'message.changed'), {
    type: 'message.changed', messageId: 7, senderId: 2, recipientId: 1,
  });
  assert.deepEqual(buildMessageEvent(row, 'message.read'), {
    type: 'message.read', messageId: 7, senderId: 2, recipientId: 1,
  });
});

test('live events are authenticated, tenant-scoped and contain no message body', async t => {
  const accounts = {
    parent: { id: 1, daycare_id: 10, role: 'parent' },
    caregiver: { id: 2, daycare_id: 10, role: 'caregiver' },
    unrelated: { id: 3, daycare_id: 10, role: 'parent' },
    otherTenant: { id: 4, daycare_id: 20, role: 'caregiver' },
  };
  const server = http.createServer();
  const hub = createHub(server, {
    authenticate: async token => accounts[token] || null,
    canType: async (user, recipientId) => Object.values(accounts).some(other =>
      other.id === recipientId && other.daycare_id === user.daycare_id &&
      (user.role !== 'parent' || ['caregiver', 'admin'].includes(other.role))),
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { hub.close(); server.close(); });
  const url = `ws://127.0.0.1:${server.address().port}/api/realtime`;

  async function connect(token) {
    const socket = new WebSocket(url);
    const events = [];
    socket.on('message', data => events.push(JSON.parse(data.toString())));
    await once(socket, 'open');
    socket.send(JSON.stringify({ type: 'auth', token }));
    for (let i = 0; i < 100 && !events.some(e => e.type === 'ready'); i++) await wait(10);
    assert.ok(events.some(e => e.type === 'ready'));
    return { socket, events };
  }

  const parent = await connect('parent');
  const caregiver = await connect('caregiver');
  const unrelated = await connect('unrelated');
  const other = await connect('otherTenant');
  await hub.publish(10, [1, 2], { type: 'message.changed', messageId: 7, senderId: 2, recipientId: 1 });
  await wait(40);
  assert.deepEqual(parent.events.at(-1), { type: 'message.changed', messageId: 7, senderId: 2, recipientId: 1 });
  assert.equal(caregiver.events.at(-1).messageId, 7);
  assert.equal(unrelated.events.length, 1);
  assert.equal(other.events.length, 1);

  await hub.publish(10, null, { type: 'resource.changed', resource: 'attendance' });
  await wait(40);
  assert.deepEqual(unrelated.events.at(-1), { type: 'resource.changed', resource: 'attendance' });
  assert.equal(other.events.length, 1);

  parent.socket.send(JSON.stringify({ type: 'typing', recipientId: 2, active: true }));
  await wait(80);
  assert.deepEqual(caregiver.events.at(-1), { type: 'typing', userId: 1, active: true });
  const previous = other.events.length;
  parent.socket.send(JSON.stringify({ type: 'typing', recipientId: 4, active: true }));
  await wait(80);
  assert.equal(other.events.length, previous);

  delete accounts.parent;
  await hub.publish(10, [1], { type: 'message.changed', messageId: 8, senderId: 2, recipientId: 1 });
  await wait(50);
  assert.equal(parent.events.some(event => event.messageId === 8), false);
  assert.notEqual(parent.socket.readyState, WebSocket.OPEN);
});

test('only relevant successful-write domains are considered for tenant refresh', () => {
  assert.equal(resourceForMutation('POST', '/api/attendance'), 'attendance');
  assert.equal(resourceForMutation('POST', '/api/portal/attendance'), 'attendance');
  assert.equal(resourceForMutation('POST', '/api/portal/checkout'), 'attendance');
  assert.equal(resourceForMutation('PATCH', '/api/parent/children/12/care-profile'), 'children');
  assert.equal(resourceForMutation('POST', '/api/communication/announcements?x=1'), 'announcements');
  assert.equal(resourceForMutation('GET', '/api/attendance'), null);
  assert.equal(resourceForMutation('POST', '/api/auth/login'), null);
  assert.equal(resourceForMutation('PATCH', '/api/notifications/preferences'), null);
  assert.equal(resourceForMutation('POST', '/api/communication/messages'), null);
});

test('a socket without valid authentication cannot subscribe', async t => {
  const server = http.createServer();
  const hub = createHub(server, { authenticate: async () => null });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { hub.close(); server.close(); });
  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/api/realtime`);
  await once(socket, 'open');
  const closed = once(socket, 'close');
  socket.send(JSON.stringify({ type: 'auth', token: 'invalid' }));
  const [code] = await closed;
  assert.equal(code, 1008);
});
