'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function renderHomeScreen() {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/screens/home/HomeScreen.tsx'),
    'utf8'
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;

  const slots = [];
  let cursor = 0;
  const react = {
    Fragment: Symbol('fragment'),
    createElement(type, props, ...children) {
      return { type, props: { ...props, children } };
    },
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (v) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }];
    },
    useRef(initial) {
      const i = cursor++;
      return slots[i] || (slots[i] = { current: initial });
    },
    useCallback(cb) { return cb; },
    useEffect() {},
  };

  const IconStub = () => 'Icon';
  const primitives = Object.fromEntries(
    ['Page', 'Text', 'Card', 'CardGlow', 'Avatar', 'Badge', 'Section', 'Button', 'Notice', 'IconButton']
      .map((name) => [name, name])
  );
  primitives.s = { row: {}, between: {}, grid: {} };

  const m = { exports: {} };
  vm.runInNewContext(compiled, {
    module: m,
    exports: m.exports,
    Intl,
    Date,
    Math,
    Promise,
    require(name) {
      if (name === 'react') return { ...react, default: react };
      if (name === 'react-native') {
        return {
          View: 'View',
          Pressable: 'Pressable',
          ActivityIndicator: 'ActivityIndicator',
          useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
        };
      }
      if (name.startsWith('phosphor-react-native')) return new Proxy({}, { get: () => IconStub });
      if (name.endsWith('Motion')) return { MotionPressable: 'MotionPressable' };
      if (name.endsWith('tokens')) {
        return {
          colors: { textPrimary: '#061224', textSecondary: '#5A6679', pastelYellow: '#FEF7E6', pastelYellowText: '#B7791F', bgSurface: '#FFFFFF', borderCard: '#ECE7DD' },
          radii: { card: 24, subcard: 16 },
        };
      }
      if (name.endsWith('System')) return primitives;
      if (name.endsWith('api/client')) return { apiClient: { patch: async () => ({}) } };
      if (name.endsWith('AuthContext')) return { useAuth: () => ({ user: { id: 1, name: 'Hanna Tadesse' } }) };
      if (name.endsWith('ChildContext')) {
        return {
          useChild: () => ({
            selectedChild: { id: 7, full_name: 'Lema Tadesse', group_name: 'Toddlers', dob: '2023-05-01' },
            childrenList: [{ id: 7, full_name: 'Lema Tadesse', group_name: 'Toddlers' }],
            setSelectedChild: () => {},
          }),
        };
      }
      if (name.endsWith('parentApi')) {
        return {
          getChildAttendance: async () => [],
          getChildReports: async () => [],
          getDailyReport: async () => null,
          getDaycareEvents: async () => [],
          getDirectMessages: async () => [],
          getAnnouncements: async () => [],
        };
      }
      throw new Error(`Unexpected import: ${name}`);
    },
  });

  const navigated = [];
  const tree = m.exports.HomeScreen({
    navigation: {
      navigate: (...args) => navigated.push(args),
      addListener: () => () => {},
    },
  });
  return { tree, navigated };
}

function flatten(node, acc = []) {
  if (!node || typeof node !== 'object') return acc;
  if (Array.isArray(node)) {
    node.forEach((n) => flatten(n, acc));
    return acc;
  }
  acc.push(node);
  flatten(node.props?.children, acc);
  return acc;
}

function textOf(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'object') return textOf(node.props?.children);
  return String(node);
}

test('HomeScreen renders a large bold Hello greeting and places Care Fees & Tuition at the bottom', () => {
  const { tree, navigated } = renderHomeScreen();
  assert.equal(tree.type, 'Page');

  const allNodes = flatten(tree);
  const greetingNode = allNodes.find(
    (n) => n.type === 'Text' && textOf(n).includes('Hello, Hanna')
  );
  assert.ok(greetingNode);
  assert.ok(greetingNode.props.size >= 28);
  assert.equal(greetingNode.props.weight, 'bold');

  const pageChildren = (tree.props.children || []).filter(Boolean);
  const lastChild = pageChildren[pageChildren.length - 1];
  assert.equal(lastChild.type, 'Card');
  assert.match(textOf(lastChild), /Care Fees & Tuition/);

  const invoicesBtn = flatten(lastChild).find(
    (n) => n.type === 'Button' && n.props.title === 'Invoices'
  );
  assert.ok(invoicesBtn);
  invoicesBtn.props.onPress();
  assert.deepEqual(navigated[0], ['ChildCareFees']);
});

