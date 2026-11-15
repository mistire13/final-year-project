'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('a failed profile refresh preserves the signed-in session and reports the failure', async () => {
  const slots = [];
  let cursor = 0, value, saved = null;
  const react = {
    createElement(type, props, ...children) {
      const merged = { ...props, children: children.length === 1 ? children[0] : children };
      return typeof type === 'function' ? type(merged) : null;
    },
    createContext() { return { Provider: ({ value: next }) => { value = next; return null; } }; },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useEffect() {},
    Fragment: ({ children }) => children,
  };
  react.default = react;
  const user = { id: 7, daycare_id: 3, role: 'parent', name: 'Test' };
  const api = {
    post: async url => url === '/auth/login' ? { data: { user, token: 'test-token' } } : {},
    get: async () => { throw new Error('network unavailable'); },
  };
  const storage = { getToken: async () => saved, setToken: async token => { saved = token; }, clearToken: async () => { saved = null; } };
  const source = fs.readFileSync(path.join(__dirname, '../src/context/AuthContext.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, __DEV__: false, console, require(name) {
    if (name === 'react') return react;
    if (name === 'react-native') return { Platform: { OS: 'android' }, AppState: {} };
    if (name === '../api/client') return { apiClient: api, tokenStorage: storage, onSessionExpired: () => () => {} };
    if (name === '../notifications/notificationService') return { setupNotifications: async () => {}, unregisterNotifications: async () => {} };
    if (name === './PackageFeaturesContext') return { PackageFeaturesProvider: ({ children }) => children };
    return {};
  } });
  function render() { cursor = 0; mod.exports.AuthProvider({ children: null }); return value; }
  await render().login('parent@example.invalid', 'test');
  const signedIn = render();
  await assert.rejects(signedIn.refreshUser(), /network unavailable/);
  assert.equal(saved, 'test-token');
  assert.equal(render().user.id, user.id);
});
