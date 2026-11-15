'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const slots = [];
let cursor = 0;
const react = {
  createElement(type, props, ...children) {
    return { type, props: { ...(props || {}), children: children.flat(Infinity) } };
  },
  Fragment: Symbol.for('react.fragment'),
  useState(init) {
    const idx = cursor++;
    if (!(idx in slots)) slots[idx] = typeof init === 'function' ? init() : init;
    return [slots[idx], (v) => { slots[idx] = typeof v === 'function' ? v(slots[idx]) : v; }];
  },
  useEffect() {},
  useMemo(fn) { return fn(); },
  useRef(init) {
    const idx = cursor++;
    if (!(idx in slots)) slots[idx] = { current: init };
    return slots[idx];
  },
};

function resolve(el) {
  if (el == null || typeof el !== 'object') return el;
  if (Array.isArray(el)) return el.map(resolve);
  if (typeof el.type === 'function') return resolve(el.type(el.props || {}));
  return { ...el, props: { ...(el.props || {}), children: resolve(el.props?.children) } };
}

function nodes(el) {
  if (el == null || typeof el !== 'object') return [];
  if (Array.isArray(el)) return el.flatMap(nodes);
  return [el, ...nodes(el.props?.children)];
}

function textOf(el) {
  if (el == null || typeof el === 'boolean') return '';
  if (typeof el === 'string' || typeof el === 'number') return String(el);
  if (Array.isArray(el)) return el.map(textOf).join('');
  return textOf(el.props?.children);
}

function loadTs(relPath, stubs) {
  const filename = path.resolve(__dirname, relPath);
  const src = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 },
  });
  const mod = new Module(filename);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const origLoad = Module._load;
  Module._load = function (req, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(stubs, req)) return stubs[req];
    if (/\.css$/.test(req)) return {};
    return origLoad.call(this, req, parent, isMain);
  };
  try {
    mod._compile(outputText, filename);
  } finally {
    Module._load = origLoad;
  }
  return mod.exports;
}

test('packageTierSummary distinguishes Standard, active Plus, cancelled, and expired Plus accurately', () => {
  const subs = loadTs('../src/portal/subscriptions.ts', {});
  const std = subs.packageTierSummary({
    package_code: 'standard',
    package_name: 'Standard',
    max_children: 50,
    active_children_count: 14,
    subscription_ends_at: new Date(Date.now() + 86400000 * 20).toISOString(),
  });
  assert.equal(std.isPlus, false);
  assert.equal(std.name, 'Standard');
  assert.equal(std.maxChildren, 50);
  assert.equal(std.activeChildren, 14);
  assert.equal(std.expired, false);

  const plusExpired = subs.packageTierSummary({
    package_code: 'premium',
    package_name: 'Plus',
    max_children: 150,
    active_children_count: 60,
    subscription_status: 'cancelled',
    subscription_ends_at: new Date(Date.now() - 86400000).toISOString(),
  });
  assert.equal(plusExpired.isPlus, true);
  assert.equal(plusExpired.expired, true);
  assert.equal(plusExpired.cancelled, true);
});

test('Summary shows Standard vs Plus comparison and PackageEditor strips server-computed feature keys on save', async () => {
  const subs = loadTs('../src/portal/subscriptions.ts', {});
  let savedArgs = null;
  const views = loadTs('../src/portal/SubscriptionViews.web.tsx', {
    react: { ...react, default: react },
    './subscriptions': subs,
    './ReceiptReference.web': { default: 'ReceiptReference' },
    './ui.web': {
      Badge: ({ value }) => react.createElement('span', { className: 'badge' }, value),
      Button: ({ children, ...rest }) => react.createElement('button', rest, children),
      Card: ({ title, children }) => react.createElement('section', { title }, children),
    },
    './api': {
      apiError: (e) => String(e?.message || e),
      portalApi: {},
      operatorApi: {
        savePackage: async (code, body) => {
          savedArgs = { code, body };
          return body;
        },
      },
    },
  });

  // 1. Standard daycare breakdown marks Plus tools as Plus only & capacity bar.
  cursor = 0; slots.length = 0;
  const stdTree = resolve(react.createElement(views.Summary, {
    showPlanBreakdown: true,
    value: {
      package_code: 'standard',
      package_name: 'Standard',
      max_children: 50,
      active_children_count: 25,
      effective_status: 'active',
      billing_cycle: 'monthly',
      subscription_terms: { code: 'standard', price: '1000.00' },
      subscription_ends_at: new Date(Date.now() + 86400000 * 30).toISOString(),
      features: { shop: false, business_analytics: false, billing_automation: false, staff_scheduling: false },
    },
  }));
  const stdText = textOf(stdTree);
  assert.match(stdText, /Standard · 25 \/ 50 children/);
  assert.match(stdText, /Plus only/);
  assert.match(stdText, /contact platform support/i);
  assert.ok(nodes(stdTree).some((n) => n.props?.className === 'j-meter-fill' && n.props?.style?.width === '50%'));

  // 2. Expired Plus marks Plus tools as Paused (expired).
  cursor = 0; slots.length = 0;
  const expTree = resolve(react.createElement(views.Summary, {
    showPlanBreakdown: true,
    value: {
      package_code: 'premium',
      package_name: 'Plus',
      max_children: 150,
      active_children_count: 80,
      effective_status: 'expired',
      billing_cycle: 'monthly',
      subscription_terms: { code: 'premium', price: '2500.00' },
      subscription_ends_at: new Date(Date.now() - 86400000).toISOString(),
      features: { shop: false, business_analytics: false, billing_automation: false, staff_scheduling: false },
    },
  }));
  assert.match(textOf(expTree), /Paused \(expired\)/);

  // 3. PackageEditor strips features and feature_policy_version before calling operatorApi.savePackage.
  cursor = 0; slots.length = 0;
  const edTree = resolve(react.createElement(views.PackageEditor, {
    offer: {
      code: 'premium',
      name: 'Plus',
      description: 'Plus package description updated cleanly',
      max_children: 150,
      trial_days: 0,
      monthly_price: '2500.00',
      six_month_price: '14000.00',
      annual_price: '25000.00',
      available: true,
      version: 2,
      features: { shop: true, business_analytics: true, billing_automation: true, staff_scheduling: true },
      feature_policy_version: 1,
    },
    onSaved: async () => {},
  }));
  const form = nodes(edTree).find((n) => n.type === 'form');
  assert.ok(form, 'PackageEditor form must render');
  await form.props.onSubmit({ preventDefault() {} });
  assert.equal(savedArgs.code, 'premium');
  assert.equal('features' in savedArgs.body, false, 'features must be stripped for Joi validation');
  assert.equal('feature_policy_version' in savedArgs.body, false, 'feature_policy_version must be stripped for Joi validation');
  assert.equal('code' in savedArgs.body, false, 'code must be stripped for Joi validation');
});

