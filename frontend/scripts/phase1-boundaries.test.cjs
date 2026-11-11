const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const ts = require("typescript");
const React = require("react");

// Execute the actual TS/TSX modules with controlled browser and transport dependencies.
// No backend, saved browser session, or network connection is used by this suite.
function load(relative, modules = {}, globals = {}) {
  const filename = path.resolve(__dirname, relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  const localRequire = createRequire(filename);
  vm.runInNewContext(compiled, {
    module, exports: module.exports, console, process, URL, __DEV__: true,
    require: (name) => {
      if (Object.hasOwn(modules, name)) return modules[name];
      if (name.startsWith("phosphor-react-native")) return modules["phosphor-react-native"] || {};
      if (name === "./previewPolicy") return load("../src/portal/previewPolicy.ts", modules, globals);
      if (name === "./workspaceRoutes" || name === "./workspaceRoutes.ts") return load("../src/portal/workspaceRoutes.ts", modules, globals);
      if (name.includes("WebMotion")) return {
        WebMotionProvider: ({ children }) => children,
        PageTransition: ({ children }) => children,
      };
      if (name.includes("SurfaceBoundary")) return {
        SurfaceBoundary: ({ children }) => children,
      };
      if (name.endsWith(".css")) return {};
      if (name.endsWith(".web") || name.endsWith(".web.tsx") || name.includes(".web")) return () => null;
      if (name === "../utils/host" || name === "../../utils/host") return { getApiBaseUrl: () => "http://localhost:5000/api", getWebPortalUrl: () => "http://localhost:5000" };
      return localRequire(name);
    },
    ...globals,
  }, { filename });
  return module.exports;
}

function browser(pathname, token = null) {
  const storageCalls = [];
  const location = { pathname, hostname: "localhost", assign(next) { this.pathname = next; } };
  return {
    storageCalls, location,
    localStorage: {
      getItem(key) { storageCalls.push(["get", key]); return token; },
      setItem(key, value) { storageCalls.push(["set", key]); token = value; },
      removeItem(key) { storageCalls.push(["remove", key]); token = null; },
    },
    history: {
      pushState(_state, _title, next) { location.pathname = next; },
      replaceState(_state, _title, next) { location.pathname = next; },
    },
    addEventListener() {}, removeEventListener() {},
  };
}

function apiFixture(pathname, token) {
  const window = browser(pathname, token);
  const api = load("../src/portal/api.ts", { "react-native": { Platform: { OS: "web" } } }, { window });
  const requests = [];
  api.portalClient.defaults.adapter = async (config) => {
    requests.push(config);
    return { data: { user: { id: 99, role: "admin" }, token: "synthetic-token" }, status: 200, statusText: "OK", headers: {}, config };
  };
  return { ...api, window, requests };
}

test("a normal portal without a saved session never attempts automatic login", async () => {
  const fixture = apiFixture("/admin/dashboard");
  assert.equal(await fixture.portalApi.session(), null);
  assert.equal(fixture.portalApi.ensureDevSession, undefined);
  assert.equal(fixture.requests.length, 0);
});

test("an expired saved session is cleared without a fallback login", async () => {
  const fixture = apiFixture("/staff/workspace", "expired-synthetic-token");
  fixture.portalClient.defaults.adapter = async (config) => {
    fixture.requests.push(config);
    const err = new Error("Expired session");
    err.response = { status: 401 };
    throw err;
  };
  assert.equal(await fixture.portalApi.session(), null);
  assert.deepEqual(fixture.requests.map((request) => [request.method, request.url]), [["get", "/auth/me"]]);
  assert.ok(fixture.window.storageCalls.some(([operation]) => operation === "remove"));
});

for (const pathname of ["/admin/preview/dashboard", "/staff/preview/workspace"]) {
  test(`${pathname} cannot read/write a saved session or dispatch API calls`, async () => {
    const fixture = apiFixture(pathname, "existing-real-session-sentinel");
    assert.equal(await fixture.portalApi.session(), null);
    fixture.portalTokenStorage.setToken("replacement");
    fixture.portalTokenStorage.clearToken();
    for (const action of [
      () => fixture.portalApi.login("test@example.invalid", "synthetic-password"),
      () => fixture.portalApi.snapshot("2026-10-17"),
      () => fixture.portalApi.save("/children", { full_name: "Synthetic child" }),
      () => fixture.portalApi.save("/users/1/status", { status: "inactive" }, "patch"),
      () => fixture.portalApi.logout(),
      () => fixture.portalApi.getSuperAdminStats(),
    ]) {
      await assert.rejects(action, /sample preview cannot connect/);
    }
    assert.equal(fixture.requests.length, 0);
    assert.deepEqual(fixture.window.storageCalls, []);
  });
}

test("explicit live login continues to use only the entered credentials", async () => {
  const fixture = apiFixture("/admin/login");
  await fixture.portalApi.login("test@example.invalid", "synthetic-password");
  assert.equal(fixture.requests.length, 1);
  assert.deepEqual(JSON.parse(fixture.requests[0].data), { email: "test@example.invalid", password: "synthetic-password" });
  assert.ok(fixture.window.storageCalls.some(([operation]) => operation === "set"));
});

function hooks() {
  const cells = [];
  let cursor = 0;
  let pending = [];
  return {
    begin() { cursor = 0; },
    async effects() { const effects = pending; pending = []; effects.forEach((effect) => effect()); await new Promise(setImmediate); },
    react: {
      ...React,
      useState(initial) {
        const index = cursor++;
        if (!Object.hasOwn(cells, index)) cells[index] = typeof initial === "function" ? initial() : initial;
        return [cells[index], (next) => { cells[index] = typeof next === "function" ? next(cells[index]) : next; }];
      },
      useRef(initial) { const index = cursor++; return cells[index] ||= { current: initial }; },
      useMemo(factory) { return factory(); },
      useEffect(effect, deps) {
        const index = cursor++;
        if (!cells[index] || !deps || deps.some((value, offset) => !Object.is(value, cells[index][offset]))) pending.push(effect);
        cells[index] = deps;
      },
    },
  };
}

function elements(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return [tree, ...elements(tree.props?.children)];
}

function portalFixture(pathname) {
  const state = hooks();
  const calls = [];
  const portalApi = Object.fromEntries(["session", "login", "logout", "snapshot", "save", "ensureDevSession", "getBroadcast"].map((method) => [method, async () => { calls.push(method); return null; }]));
  const stubs = Object.fromEntries(["Analytics", "Attendance", "Children", "Duties", "Groups", "Monitoring", "Overview", "Registry", "Reports", "Badge", "Button", "Card", "Icon", "Modal", "Person", "RecordForm"].map((name) => [name, function Stub() {}]));
  const window = browser(pathname, "real-session-must-not-be-read");
  const Portal = load("../src/portal/Portal.web.tsx", {
    react: state.react, "./portal.css": {}, "./api": { portalApi, apiError: () => "Test error" },
    "./model": load("../src/portal/model.ts"), "./pages.web": stubs, "./ui.web": stubs,
    "../../design/figma-exports/ankelba-symbol.png": "local-test-logo.png",
  }, { window, document: { title: "" }, setTimeout: () => 0, clearTimeout: () => {} }).default;
  return { calls, state, window, render() { state.begin(); return Portal(); } };
}

test("preview mount, date changes, refresh and mutations stay entirely in sample data", async () => {
  const fixture = portalFixture("/admin/preview/dashboard");
  let tree = fixture.render();
  await fixture.state.effects();
  tree = fixture.render();
  const initial = elements(tree).find((element) => typeof element.props?.open === "function" && element.props?.data)?.props;
  assert.equal(initial.preview, true);
  assert.ok(initial.data.children.length > 0);
  elements(tree).find((element) => element.props?.["aria-label"] === "Refresh data").props.onClick();
  elements(tree).find((element) => element.props?.["aria-label"] === "Selected date").props.onChange({ target: { value: "2026-10-16" } });
  initial.open("group", { id: 0 });
  tree = fixture.render();
  await fixture.state.effects();
  const modal = elements(tree).find((element) => element.props?.modal);
  await modal.props.save({ name: "Synthetic preview room", description: "Preview only" });
  tree = fixture.render();
  const updated = elements(tree).find((element) => typeof element.props?.open === "function" && element.props?.data)?.props;
  assert.ok(updated.data.groups.some((group) => group.name === "Synthetic preview room"));
  assert.ok(updated.data.audit.some((entry) => entry.action === "GROUPS"));
  assert.deepEqual(fixture.calls, []);
  assert.deepEqual(fixture.window.storageCalls, []);
});

test("normal portal mount checks the current session and then requires explicit sign-in", async () => {
  const fixture = portalFixture("/admin/dashboard");
  fixture.render();
  await fixture.state.effects();
  const tree = fixture.render();
  assert.ok(elements(tree).some((element) => element.type === "form"));
  assert.deepEqual(fixture.calls, ["session", "getBroadcast"]);
});

test("production preview routes cannot mount a live portal, and development route modes use separate state", () => {
  function PortalStub() {}
  const renderGate = (pathname, development) => {
    const state = hooks();
    const Gate = load("../src/portal/PortalGate.web.tsx", {
      react: state.react, "./Portal.web": PortalStub, "../admin/DaycareAdmin.web": PortalStub,
      "./LandingPage.web": () => null, "./SuperAdmin.web": () => null,
    }, { window: browser(pathname), __DEV__: development }).default;
    return Gate({ children: null });
  };
  assert.equal(elements(renderGate("/admin/preview/dashboard", false)).some((element) => element.type === PortalStub), false);
  assert.notEqual(renderGate("/admin/preview/dashboard", true).key, renderGate("/admin/dashboard", true).key);
});

test("legacy registration screen gives enrollment guidance and only navigates to sign-in", () => {
  const components = new Proxy({ s: {} }, { get: (object, key) => object[key] || String(key) });
  const { RegisterScreen } = load("../src/screens/auth/LoginScreen.tsx", {
    react: React, "react-native": components, "phosphor-react-native": components,
    "../../components/design/System": components, "../../context/AuthContext": {},
  });
  const calls = [];
  const tree = RegisterScreen({ navigation: { replace: (...args) => calls.push(args) } });
  assert.equal(elements(tree).some((element) => ["TextInput", "Field"].includes(element.type)), false);
  elements(tree).find((element) => element.props?.title === "Back to sign in").props.onPress();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "Login");
});
