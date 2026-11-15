'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('notification switches retain saved values on failure and serialize changes', async () => {
  const slots = []; let cursor = 0, value, pending, calls = 0;
  const react = {
    createElement(type, props, ...children) {
      const merged = { ...props, children: children.length === 1 ? children[0] : children };
      return typeof type === 'function' ? type(merged) : null;
    },
    createContext() { return { Provider: ({ value: next }) => { value = next; return null; } }; },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useEffect() {},
  };
  react.default = react;
  const api = { patch: () => { calls++; return new Promise((resolve, reject) => { pending = { resolve, reject }; }); } };
  const source = fs.readFileSync(path.join(__dirname, '../src/context/DesignContext.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require(name) {
    if (name === 'react') return react;
    if (name === '../api/client') return { apiClient: api };
    if (name === './AuthContext') return { useAuth: () => ({ user: { id: 1, daycare_id: 1 } }) };
    return {};
  } });
  function render() { cursor = 0; mod.exports.DesignProvider({ children: null }); return value; }
  let state = render();
  assert.equal(state.preferences.announcements, true);
  state.togglePreference('announcements');
  state.togglePreference('announcements');
  assert.equal(calls, 1);
  assert.equal(render().preferences.announcements, true);
  pending.reject(new Error('offline'));
  await new Promise(resolve => setImmediate(resolve));
  state = render();
  assert.equal(state.preferences.announcements, true);
  assert.match(state.persistenceError, /not saved/);
  state.togglePreference('announcements');
  pending.resolve({});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(render().preferences.announcements, false);
});
