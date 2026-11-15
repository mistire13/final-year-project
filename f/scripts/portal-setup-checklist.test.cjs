'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadSetupChecklist() {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/portal/SetupChecklist.web.tsx'),
    'utf8'
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;

  const react = {
    createElement(type, props, ...children) {
      return { type, props: { ...props, children } };
    },
  };
  const m = { exports: {} };
  vm.runInNewContext(compiled, {
    module: m,
    exports: m.exports,
    require(name) {
      if (name === 'react') return { ...react, default: react };
      if (name.endsWith('.css')) return {};
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return m.exports;
}

function collectText(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (typeof node === 'object') return collectText(node.props?.children);
  return String(node);
}

function baseCompleteDataset() {
  return {
    daycare: { id: 1, name: 'Sunny Care', contact_phone: '+251911000000', address: 'Bole, Addis Ababa' },
    groups: [{ id: 10, name: 'Toddlers' }],
    users: [{ id: 20, role: 'caregiver', status: 'active' }],
    children: [{ id: 30, full_name: 'Hanna Bekele', enrollment_status: 'active', group_id: 10, caregiver_id: 20 }],
    guardians: [{ id: 40, child_id: 30 }],
    duties: [{ id: 50, staff_id: 20, group_id: 10, status: 'active', active: true, can_attendance: true, can_pickup: true }],
  };
}

test('SetupChecklist disappears completely (returns null) once all setup steps are completed', () => {
  const { default: SetupChecklist, getSetupSteps } = loadSetupChecklist();
  const data = baseCompleteDataset();
  const steps = getSetupSteps(data);
  assert.equal(steps.length, 6);
  assert.equal(steps.every((s) => s.done), true);
  assert.equal(SetupChecklist({ data }), null);
});

test('SetupChecklist renders remaining setup steps when any live milestone becomes incomplete', () => {
  const { default: SetupChecklist } = loadSetupChecklist();
  const withoutDuties = {
    ...baseCompleteDataset(),
    duties: [{ id: 50, staff_id: 20, group_id: 10, status: 'revoked', active: false, can_attendance: true, can_pickup: true }],
  };
  const tree = SetupChecklist({ data: withoutDuties });
  assert.ok(tree);
  const renderedText = collectText(tree);
  assert.match(renderedText, /Center setup/);
  assert.match(renderedText, /5 of 6 complete/);
  assert.doesNotMatch(renderedText, /Center setup complete/);
});

