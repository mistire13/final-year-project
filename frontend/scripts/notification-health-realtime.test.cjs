'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, requireMock, extras = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: requireMock, Promise, URL, setTimeout, clearTimeout, ...extras });
  return module.exports;
}

test('foreground health alerts use the activity preference and Android channel', async () => {
  let prefs = { messages: false, activity: true };
  const scheduled = [];
  const notifications = {
    AndroidImportance: { DEFAULT: 3 }, SchedulableTriggerInputTypes: { TIME_INTERVAL: 'time' },
    setNotificationHandler() {}, setNotificationChannelAsync: async () => {},
    getPermissionsAsync: async () => ({ granted: true }),
    scheduleNotificationAsync: async value => { scheduled.push(value); },
  };
  const service = load('src/notifications/notificationService.native.ts', name => {
    if (name === 'expo-notifications') return notifications;
    if (name === 'expo-secure-store') return {};
    if (name === 'expo-constants') return { __esModule: true, default: {} };
    if (name === 'react-native') return { AppState: { currentState: 'active' }, Platform: { OS: 'android' } };
    if (name === '../api/client') return { apiClient: { get: async () => ({ data: { notifications: prefs } }) } };
    throw new Error(`Unexpected import: ${name}`);
  });
  await service.notifyIncomingMessage('health');
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].trigger.channelId, 'activity');
  assert.equal(scheduled[0].content.body, 'Your daycare shared a health update.');
  await service.notifyIncomingMessage('message');
  assert.equal(scheduled.length, 1, 'disabled messages do not block health and do block message alerts');
  prefs = { messages: true, activity: false };
  await service.notifyIncomingMessage('health');
  assert.equal(scheduled.length, 1, 'disabled activity blocks health alerts');
  await service.notifyIncomingMessage('message');
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[1].trigger.channelId, 'messages');
});

test('incoming health invalidations select the health notification path', async () => {
  const kinds = [];
  let socket;
  class MockSocket {
    static OPEN = 1;
    constructor() { socket = this; this.readyState = 1; }
    send() {}
    close() {}
  }
  const realtime = load('src/services/realtime.ts', name => {
    if (name === 'react-native') return { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) }, Platform: { OS: 'android' } };
    if (name === '../utils/host') return { getApiBaseUrl: () => 'http://localhost:5000/api' };
    if (name === '../notifications/notificationService') return { notifyIncomingMessage: async kind => { kinds.push(kind); } };
    throw new Error(`Unexpected import: ${name}`);
  }, { WebSocket: MockSocket });
  const unsubscribe = realtime.subscribeRealtime('token', () => {}, 1);
  socket.onmessage({ data: JSON.stringify({ type: 'ready' }) });
  socket.onmessage({ data: JSON.stringify({ type: 'message.changed', messageId: 2, senderId: 3, recipientId: 1, notificationKind: 'health' }) });
  socket.onmessage({ data: JSON.stringify({ type: 'message.changed', messageId: 4, senderId: 3, recipientId: 1 }) });
  assert.deepEqual(kinds, ['health', 'message']);
  unsubscribe();
});

test('a new signed-in identity replaces an older in-flight device registration', async () => {
  let resolveFirstToken;
  let calls = 0;
  const posts = [];
  const notifications = {
    AndroidImportance: { DEFAULT: 3 },
    setNotificationHandler() {}, setNotificationChannelAsync: async () => {},
    getPermissionsAsync: async () => ({ granted: true }),
    getExpoPushTokenAsync: async () => {
      calls++;
      if (calls === 1) return new Promise(resolve => { resolveFirstToken = resolve; });
      return { data: 'ExpoPushToken[new]' };
    },
  };
  const service = load('src/notifications/notificationService.native.ts', name => {
    if (name === 'expo-notifications') return notifications;
    if (name === 'expo-secure-store') return { getItemAsync: async () => null, setItemAsync: async () => {} };
    if (name === 'expo-constants') return { __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'project' } } } } };
    if (name === 'react-native') return { AppState: { currentState: 'active' }, Platform: { OS: 'android' } };
    if (name === '../api/client') return { apiClient: { post: async (_url, body) => { posts.push(body.token); } } };
    throw new Error(`Unexpected import: ${name}`);
  });
  const first = service.setupNotifications(true, 'account-a');
  while (!resolveFirstToken) await new Promise(resolve => setImmediate(resolve));
  const second = service.setupNotifications(true, 'account-b');
  resolveFirstToken({ data: 'ExpoPushToken[old]' });
  await Promise.all([first, second]);
  assert.equal(calls, 2);
  assert.deepEqual(posts, ['ExpoPushToken[new]']);
});

test('an in-flight logout completes before the next identity registers its device', async () => {
  let resolveDelete;
  let storedToken = 'ExpoPushToken[shared]';
  const operations = [];
  const notifications = {
    AndroidImportance: { DEFAULT: 3 }, setNotificationHandler() {}, setNotificationChannelAsync: async () => {},
    getPermissionsAsync: async () => ({ granted: true }),
    getExpoPushTokenAsync: async () => ({ data: 'ExpoPushToken[shared]' }),
    getAllScheduledNotificationsAsync: async () => [],
  };
  const service = load('src/notifications/notificationService.native.ts', name => {
    if (name === 'expo-notifications') return notifications;
    if (name === 'expo-secure-store') return {
      getItemAsync: async () => storedToken,
      setItemAsync: async (_key, token) => { storedToken = token; },
      deleteItemAsync: async () => { storedToken = null; },
    };
    if (name === 'expo-constants') return { __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'project' } } } } };
    if (name === 'react-native') return { AppState: { currentState: 'active' }, Platform: { OS: 'android' } };
    if (name === '../api/client') return { apiClient: {
      delete: async () => { operations.push('delete'); await new Promise(resolve => { resolveDelete = resolve; }); },
      post: async () => { operations.push('post'); },
    } };
    throw new Error(`Unexpected import: ${name}`);
  });
  const logout = service.unregisterNotifications();
  while (!resolveDelete) await new Promise(resolve => setImmediate(resolve));
  const login = service.setupNotifications(true, 'account-b');
  assert.deepEqual(operations, ['delete']);
  resolveDelete();
  await Promise.all([logout, login]);
  assert.deepEqual(operations, ['delete', 'post']);
  assert.equal(storedToken, 'ExpoPushToken[shared]');
});
