'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function createHarness() {
  let currentUser = null;
  const slots = [];
  let cursor = 0;
  let effects = [];
  let renderedContext = null;

  const react = {
    createElement(type, props, ...children) {
      const mergedProps = { ...(props || {}) };
      if (children.length === 1) mergedProps.children = children[0];
      else if (children.length > 1) mergedProps.children = children;
      if (typeof type === 'function') {
        return type(mergedProps);
      }
      return { type, props: mergedProps };
    },
    createContext(def) {
      return {
        _currentValue: def,
        Provider: ({ value, children }) => {
          renderedContext = value;
          return children;
        },
      };
    },
    useContext(ctx) { return ctx._currentValue; },
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      const setter = value => {
        slots[i] = typeof value === 'function' ? value(slots[i]) : value;
      };
      return [slots[i], setter];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useEffect(effect, deps) {
      const i = cursor++;
      const previous = slots[i];
      const hasChanged = !previous || !deps || deps.some((val, idx) => val !== previous.deps[idx]);
      if (hasChanged) {
        previous?.cleanup?.();
        slots[i] = { deps: deps ? [...deps] : undefined };
        effects.push(() => {
          const cleanup = effect();
          slots[i].cleanup = typeof cleanup === 'function' ? cleanup : undefined;
        });
      }
    },
  };
  react.default = react;

  let mockKids = [];
  const source = fs.readFileSync(path.join(__dirname, '../src/context/ChildContext.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;

  const moduleObj = { exports: {} };
  vm.runInNewContext(compiled, {
    module: moduleObj,
    exports: moduleObj.exports,
    require(name) {
      if (name === 'react') return react;
      if (name === './AuthContext') return { useAuth: () => ({ user: currentUser }) };
      if (name === '../utils/cart') return { clampQuantity: (q) => q };
      if (name === '../api/parentApi') return { getMyChildren: async () => mockKids };
      return {};
    },
  });

  const ChildProvider = moduleObj.exports.ChildProvider;

  const render = () => {
    for (let pass = 0; pass < 5; pass++) {
      cursor = 0;
      const passEffects = [];
      effects = passEffects;
      ChildProvider({ children: null });
      if (!passEffects.length) break;
      for (const eff of passEffects) eff();
    }
    return renderedContext;
  };

  return {
    setUser(u) { currentUser = u; },
    setMockKids(kids) { mockKids = kids; },
    render,
    getContext() { return renderedContext; },
  };
}

test('preserves previously selected child when user object updates on background revalidation', () => {
  const h = createHarness();
  const child1 = { id: 101, full_name: 'Child One', daycare_id: 1 };
  const child2 = { id: 102, full_name: 'Child Two', daycare_id: 1 };
  const child3 = { id: 103, full_name: 'Child Three', daycare_id: 1 };

  // 1. Initial mount with linked_children
  h.setUser({ id: 1, role: 'parent', linked_children: [child1, child2, child3] });
  let ctx = h.render();
  assert.equal(ctx.selectedChild?.id, 101);
  assert.equal(ctx.childrenList.length, 3);

  // 2. Parent switches to child2
  ctx.setSelectedChild(child2);
  ctx = h.render();
  assert.equal(ctx.selectedChild?.id, 102);

  // 3. Background token refresh or profile revalidation delivers a new user object reference
  h.setUser({ id: 1, role: 'parent', linked_children: [child1, child2, child3], token_refreshed: true });
  ctx = h.render();
  // Must preserve child2!
  assert.equal(ctx.selectedChild?.id, 102, 'selectedChild must remain child2 (102) after user refresh');

  // 4. Parent switches to child3
  ctx.setSelectedChild(child3);
  ctx = h.render();
  assert.equal(ctx.selectedChild?.id, 103);

  // 5. Another revalidation with same children
  h.setUser({ id: 1, role: 'parent', linked_children: [child1, child2, child3], revalidated_at: Date.now() });
  ctx = h.render();
  assert.equal(ctx.selectedChild?.id, 103, 'selectedChild must remain child3 (103) after user refresh');
});

test('resets selectedChild and childrenList on user logout', () => {
  const h = createHarness();
  const child1 = { id: 101, full_name: 'Child One', daycare_id: 1 };

  h.setUser({ id: 1, role: 'parent', linked_children: [child1] });
  let ctx = h.render();
  assert.equal(ctx.selectedChild?.id, 101);

  // Logout
  h.setUser(null);
  ctx = h.render();
  assert.equal(ctx.selectedChild, null);
  assert.equal(ctx.childrenList.length, 0);
});

test('falls back to first available child if previously selected child is removed', () => {
  const h = createHarness();
  const child1 = { id: 101, full_name: 'Child One', daycare_id: 1 };
  const child2 = { id: 102, full_name: 'Child Two', daycare_id: 1 };

  h.setUser({ id: 1, role: 'parent', linked_children: [child1, child2] });
  let ctx = h.render();
  ctx.setSelectedChild(child2);
  ctx = h.render();
  assert.equal(ctx.selectedChild?.id, 102);

  // Child2 is unlinked / removed
  h.setUser({ id: 1, role: 'parent', linked_children: [child1] });
  ctx = h.render();
  assert.equal(ctx.selectedChild?.id, 101, 'falls back to child1 when child2 is no longer in list');
});
