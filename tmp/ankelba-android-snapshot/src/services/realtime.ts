import { AppState, Platform } from 'react-native';
import { getApiBaseUrl } from '../utils/host';
import { notifyIncomingMessage } from '../notifications/notificationService';

export type RealtimeEvent =
  | { type: 'ready' | 'disconnected' }
  | { type: 'message.changed' | 'message.read'; messageId: number; senderId: number; recipientId: number; notificationKind?: 'health' }
  | { type: 'resource.changed'; resource: string }
  | { type: 'typing'; userId: number; active: boolean };

type Listener = (event: RealtimeEvent) => void;
type Connection = {
  listeners: Set<Listener>;
  socket: WebSocket | null;
  ready: boolean;
  retry: ReturnType<typeof setTimeout> | null;
  attempts: number;
  stopped: boolean;
  appActive: boolean;
  appSubscription: { remove(): void };
  userId?: number;
  notifiedMessages: Set<number>;
};

// Share one socket per signed-in session, even when several tabs are mounted.
const connections = new Map<string, Connection>();

function url(): string {
  const api = new URL(getApiBaseUrl());
  api.protocol = api.protocol === 'https:' ? 'wss:' : 'ws:';
  api.pathname = '/api/realtime';
  api.search = '';
  api.hash = '';
  return api.toString();
}

function publish(connection: Connection, event: RealtimeEvent) {
  connection.listeners.forEach(listener => listener(event));
}

function connect(token: string, connection: Connection) {
  if (connection.stopped || !connection.appActive || connection.socket) return;
  let socket: WebSocket;
  try { socket = new WebSocket(url()); } catch { schedule(token, connection); return; }
  connection.socket = socket;
  socket.onopen = () => {
    if (!connection.stopped && connection.socket === socket) {
      // Credentials are sent in the first frame, never in a URL or query string.
      socket.send(JSON.stringify({ type: 'auth', token }));
    }
  };
  socket.onmessage = message => {
    if (connection.stopped || connection.socket !== socket || typeof message.data !== 'string') return;
    try {
      const data = JSON.parse(message.data);
      if (data.type === 'ready') {
        connection.ready = true;
        connection.attempts = 0;
        publish(connection, { type: 'ready' });
      } else if (connection.ready && (data.type === 'message.changed' || data.type === 'message.read') &&
        Number.isSafeInteger(data.messageId) && Number.isSafeInteger(data.senderId) && Number.isSafeInteger(data.recipientId)) {
        if (Platform.OS !== 'web' && data.type === 'message.changed' && data.recipientId === connection.userId &&
          data.senderId !== connection.userId && !connection.notifiedMessages.has(data.messageId)) {
          connection.notifiedMessages.add(data.messageId);
          if (connection.notifiedMessages.size > 200) connection.notifiedMessages.delete(connection.notifiedMessages.values().next().value!);
          void notifyIncomingMessage(data.notificationKind === 'health' ? 'health' : 'message').catch(() => {});
        }
        publish(connection, data);
      } else if (connection.ready && data.type === 'resource.changed' && typeof data.resource === 'string') {
        publish(connection, { type: 'resource.changed', resource: data.resource });
      } else if (connection.ready && data.type === 'typing' && Number.isSafeInteger(data.userId) && typeof data.active === 'boolean') {
        publish(connection, data);
      }
    } catch { /* Ignore malformed frames. */ }
  };
  socket.onerror = () => { try { socket.close(); } catch { /* already closed */ } };
  socket.onclose = event => {
    if (connection.socket !== socket) return;
    connection.socket = null;
    connection.ready = false;
    publish(connection, { type: 'disconnected' });
    // A policy violation usually means the session was revoked. Wait for a new token.
    if (event.code !== 1008) schedule(token, connection);
  };
}

function schedule(token: string, connection: Connection) {
  if (connection.stopped || !connection.appActive || connection.retry) return;
  const delay = Math.min(30000, 1000 * 2 ** Math.min(connection.attempts++, 5));
  connection.retry = setTimeout(() => { connection.retry = null; connect(token, connection); }, delay);
}

export function subscribeRealtime(token: string, listener: Listener, userId?: number): () => void {
  let connection = connections.get(token);
  if (!connection) {
    const created: Connection = {
      listeners: new Set<Listener>(), socket: null, ready: false, retry: null,
      attempts: 0, stopped: false, appActive: AppState.currentState !== 'background',
      appSubscription: null as unknown as { remove(): void },
      userId, notifiedMessages: new Set<number>(),
    };
    created.appSubscription = AppState.addEventListener('change', state => {
      created.appActive = state === 'active';
      if (created.appActive) connect(token, created);
      else {
        if (created.retry) { clearTimeout(created.retry); created.retry = null; }
        created.socket?.close();
      }
    });
    connection = created;
    connections.set(token, created);
  }
  if (userId) connection.userId = userId;
  connection.listeners.add(listener);
  if (connection.ready) listener({ type: 'ready' });
  else connect(token, connection);
  const current = connection;
  return () => {
    current.listeners.delete(listener);
    if (current.listeners.size) return;
    current.stopped = true;
    if (current.retry) clearTimeout(current.retry);
    current.appSubscription.remove();
    current.socket?.close();
    connections.delete(token);
  };
}

export function sendTyping(token: string | null, recipientId: number, active: boolean) {
  const connection = token ? connections.get(token) : undefined;
  if (!connection?.ready || !connection.socket || connection.socket.readyState !== WebSocket.OPEN) return;
  connection.socket.send(JSON.stringify({ type: 'typing', recipientId, active }));
}
