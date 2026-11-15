'use strict';

// WebSocket messages are invalidations only. The authenticated HTTP API remains
// the source of truth, including after a client disconnects or misses an event.
const { WebSocketServer, WebSocket } = require('ws');
const db = require('../../config/db');
const { withTenant } = require('../../db/tenant-pool');

let currentHub = null;

// Reuse the actual HTTP authentication middleware so both legacy JWT sessions
// and the opt-in daycare session preview retain their normal revocation rules.
async function authenticateToken(token) {
  if (typeof token !== 'string' || token.length < 1 || token.length > 4096) return null;
  const authenticate = require('../../middleware/auth');
  const req = { method: 'GET', headers: { authorization: `Bearer ${token}` }, cookies: {}, query: {}, params: {}, body: {} };
  return new Promise((resolve) => {
    let settled = false;
    const done = (user) => { if (!settled) { settled = true; resolve(user); } };
    const res = { set() { return this; }, status() { return this; }, json() { done(null); return this; } };
    try {
      Promise.resolve(authenticate(req, res, (error) => done(error ? null : req.user))).catch(() => done(null));
    } catch { done(null); }
  });
}

async function mayType(user, recipientId) {
  if (!user.daycare_id || !Number.isSafeInteger(recipientId) || recipientId <= 0 || recipientId === Number(user.id)) return false;
  return withTenant(Number(user.daycare_id), async () => {
    const { rows } = await db.query(`SELECT u.id, u.daycare_id, u.status, r.name AS role
      FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`, [recipientId]);
    const other = rows[0];
    return !!other && other.status === 'active' && Number(other.daycare_id) === Number(user.daycare_id)
      && (user.role !== 'parent' || ['admin', 'caregiver'].includes(other.role));
  });
}

function createHub(server, options = {}) {
  const authenticate = options.authenticate || authenticateToken;
  const canType = options.canType || mayType;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false });
  const sockets = new Set();

  async function authorized(socket) {
    const current = await authenticate(socket.token);
    if (!current || Number(current.id) !== Number(socket.user?.id)
      || Number(current.daycare_id) !== Number(socket.user?.daycare_id)
      || current.role !== socket.user?.role) {
      socket.close(1008, 'Session unavailable');
      return null;
    }
    return current;
  }

  function send(socket, event) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
  }

  async function publish(daycareId, userIds, event) {
    if (!Number.isSafeInteger(Number(daycareId)) || Number(daycareId) <= 0) return;
    // Null means a coarse tenant-wide resource invalidation, never a message.
    const allowed = userIds === null ? null : new Set(userIds.map(Number));
    await Promise.all([...sockets].map(async socket => {
      if (!socket.user || Number(socket.user.daycare_id) !== Number(daycareId) || (allowed && !allowed.has(Number(socket.user.id)))) return;
      try { if (await authorized(socket)) send(socket, event); }
      catch { socket.close(1011, 'Connection unavailable'); }
    }));
  }

  wss.on('connection', (socket) => {
    if (sockets.size >= 1000) { socket.close(1013, 'Try again later'); return; }
    sockets.add(socket);
    let authenticating = false;
    let lastTyping = 0;
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('error', () => {});
    const deadline = setTimeout(() => { if (!socket.user) socket.close(1008, 'Authentication required'); }, 10000);
    deadline.unref();
    socket.on('close', () => { clearTimeout(deadline); sockets.delete(socket); socket.token = null; });
    socket.on('message', async (raw, binary) => {
      try {
        if (binary) { socket.close(1008, 'Invalid request'); return; }
        let event;
        try { event = JSON.parse(raw.toString()); } catch { socket.close(1008, 'Invalid request'); return; }
        if (!event || typeof event !== 'object' || Array.isArray(event)) { socket.close(1008, 'Invalid request'); return; }
        if (!socket.user) {
          if (authenticating || event.type !== 'auth') { socket.close(1008, 'Authentication required'); return; }
          authenticating = true;
          const user = await authenticate(event.token);
          if (socket.readyState !== WebSocket.OPEN) return;
          if (!user?.daycare_id || !['admin', 'caregiver', 'parent'].includes(user.role)) { socket.close(1008, 'Session unavailable'); return; }
          socket.user = user;
          socket.token = event.token;
          clearTimeout(deadline);
          send(socket, { type: 'ready' });
          return;
        }
        if (event.type !== 'typing' || typeof event.active !== 'boolean' || !Number.isSafeInteger(event.recipientId)) return;
        // A bounded rate keeps typing signals inexpensive and transient.
        const now = Date.now();
        if (event.active && now - lastTyping < 700) return;
        lastTyping = now;
        const user = await authorized(socket);
        if (!user || !(await canType(user, event.recipientId))) return;
        await publish(user.daycare_id, [event.recipientId], { type: 'typing', userId: Number(user.id), active: event.active });
      } catch { if (socket.readyState === WebSocket.OPEN) socket.close(1011, 'Connection unavailable'); }
    });
  });

  function upgrade(req, socket, head) {
    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { socket.destroy(); return; }
    if (pathname !== '/api/realtime') return;
    // The credential is sent in the first frame, never a logged URL parameter.
    if (req.url !== '/api/realtime') { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  }
  server.on('upgrade', upgrade);
  const heartbeat = setInterval(() => {
    for (const socket of sockets) {
      if (!socket.isAlive) { socket.terminate(); continue; }
      socket.isAlive = false;
      socket.ping();
      if (socket.user) authorized(socket).catch(() => socket.close(1011, 'Connection unavailable'));
    }
  }, 30000);
  heartbeat.unref();
  return {
    publish,
    close() { clearInterval(heartbeat); server.off('upgrade', upgrade); for (const socket of sockets) socket.terminate(); wss.close(); },
  };
}

function attachRealtime(server) { currentHub = createHub(server); return currentHub; }
function buildMessageEvent(row, type) {
  if (!row || !Number.isSafeInteger(Number(row.id)) || !Number.isSafeInteger(Number(row.sender_id))
    || !Number.isSafeInteger(Number(row.recipient_id))) return;
  return {
    type,
    messageId: Number(row.id),
    senderId: Number(row.sender_id),
    recipientId: Number(row.recipient_id),
    ...(row.push_event_type === 'health' && type === 'message.changed' ? { notificationKind: 'health' } : {}),
  };
}
function eventFor(row, type) {
  const event = buildMessageEvent(row, type);
  if (!event) return;
  if (currentHub) void currentHub.publish(row.daycare_id, [row.sender_id, row.recipient_id], event).catch(() => {});
}
const publishMessage = row => eventFor(row, 'message.changed');
const publishRead = row => eventFor(row, 'message.read');
function publishResource(daycareId, resource) {
  if (currentHub) void currentHub.publish(daycareId, null, { type: 'resource.changed', resource }).catch(() => {});
}
module.exports = { createHub, attachRealtime, publishMessage, publishRead, publishResource, authenticateToken, mayType, buildMessageEvent };
