const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function fixture(onSave = async () => {}, options = {}) {
  const states = [],
    refs = [];
  let cursor = 0,
    refCursor = 0,
    closed = 0;
  const react = {
    createElement: (type, props, ...children) => ({
      type,
      props: { ...props, children },
    }),
    useState(initial) {
      const i = cursor++;
      if (!(i in states)) states[i] = initial;
      return [
        states[i],
        (value) => {
          states[i] = value;
        },
      ];
    },
    useRef(initial) {
      const i = refCursor++;
      if (!(i in refs)) refs[i] = { current: initial };
      return refs[i];
    },
    useEffect() {},
  };
  const output = ts.transpileModule(
    fs.readFileSync(
      require.resolve("../src/portal/PickupVerification.web.tsx"),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
      },
    },
  ).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(output, {
    module: mod,
    exports: mod.exports,
    require(name) {
      if (name === "react") return react;
      if (name === "./ui.web")
        return {
          Button: "button",
          Person: "person",
          Badge: "badge",
          Icon: "icon",
        };
      if (name === "./api")
        return {
          apiError: (e) => e.message,
          portalApi: {
            identifyBiometricBySlot:
              options.identifyBiometricBySlot || (async () => ({})),
          },
        };
      if (name === "../services/biometricSerial")
        return {
          biometricSerial: {
            getStatus: () => options.scannerStatus || "unsupported",
            scan: options.scan || (async () => ({ match: false })),
          },
        };
      if (name === "./fingerprintPresentation") {
        const presentation = { exports: {} };
        const presentationOutput = ts.transpileModule(
          fs.readFileSync(
            require.resolve("../src/portal/fingerprintPresentation.ts"),
            "utf8",
          ),
          { compilerOptions: { module: ts.ModuleKind.CommonJS } },
        ).outputText;
        vm.runInNewContext(presentationOutput, {
          module: presentation,
          exports: presentation.exports,
        });
        return presentation.exports;
      }
      throw Error("Unexpected module " + name);
    },
  });
  const props = {
    row: { id: 1, full_name: "Test Child" },
    data: {
      groups: [],
      guardians: [
        {
          id: 1,
          child_id: 1,
          user_id: 2,
          pickup_authorized: true,
          relationship: "Mother",
        },
        {
          id: 2,
          child_id: 1,
          user_id: 3,
          pickup_authorized: true,
          relationship: "Father",
        },
      ],
      users: [
        { id: 2, name: "Adult One", status: "active" },
        { id: 3, name: "Adult Two", status: "active" },
      ],
      guardianRequests: [],
    },
    onSave,
    onClose: () => closed++,
    preview: options.preview ?? true,
  };
  const render = () => {
    cursor = 0;
    refCursor = 0;
    return mod.exports.PickupVerification(props);
  };
  const nodes = (n) =>
    !n || typeof n !== "object"
      ? []
      : Array.isArray(n)
        ? n.flatMap(nodes)
        : [n, ...nodes(n.props.children)];
  const text = (n) =>
    !n || typeof n !== "object"
      ? String(n ?? "")
      : Array.isArray(n)
        ? n.map(text).join("")
        : text(n.props.children);
  const find = (type, label) =>
    nodes(render()).find(
      (n) => n.type === type && (!label || text(n) === label),
    );
  const manual = () => find("button", "Manual check").props.onClick();
  const fill = () => {
    manual();
    find("select").props.onChange({ target: { value: "user:2" } });
    find("input").props.onChange({ target: { checked: true } });
    find("textarea").props.onChange({
      target: { value: "Photo ID checked against approved record." },
    });
  };
  return { find, render, text, props, manual, fill, closed: () => closed };
}

test("manual pickup requires an approved adult, explicit identity confirmation and a note", () => {
  const f = fixture();
  assert.equal(f.find("button", "Scan fingerprint").props.disabled, true);
  f.manual();
  assert.equal(f.find("button", "Confirm pickup").props.disabled, true);
  f.find("select").props.onChange({ target: { value: "user:2" } });
  f.find("textarea").props.onChange({
    target: { value: "Photo ID checked against approved record." },
  });
  assert.equal(f.find("button", "Confirm pickup").props.disabled, true);
  f.find("input").props.onChange({ target: { checked: true } });
  assert.equal(f.find("button", "Confirm pickup").props.disabled, false);
  f.find("select").props.onChange({ target: { value: "user:3" } });
  assert.equal(f.find("input").props.checked, false);
  assert.equal(f.find("textarea").props.value, "");
  assert.equal(f.find("button", "Confirm pickup").props.disabled, true);
});
test("revoking authorization disables confirmation even after staff completed the fields", () => {
  const f = fixture();
  f.fill();
  f.props.data.guardians[0].pickup_authorized = false;
  assert.equal(f.find("button", "Confirm pickup").props.disabled, true);
});
test("duplicate clicks submit once and pickup closes only after the save resolves", async () => {
  let resolve,
    calls = 0;
  const f = fixture(() => {
    calls++;
    return new Promise((done) => {
      resolve = done;
    });
  });
  f.fill();
  const submit = f.find("button", "Confirm pickup").props.onClick;
  const first = submit();
  await submit();
  assert.equal(calls, 1);
  assert.equal(f.closed(), 0);
  assert.equal(f.find("button", "Recording pickup…").props.disabled, true);
  resolve();
  await first;
  assert.equal(f.closed(), 1);
});
test("a rejected checkout keeps the form and exposes the error without reporting success", async () => {
  const f = fixture(async () => {
    throw Error("Your pickup shift has ended.");
  });
  f.fill();
  await f.find("button", "Confirm pickup").props.onClick();
  assert.equal(f.closed(), 0);
  assert.ok(f.text(f.render()).includes("Your pickup shift has ended."));
  assert.equal(f.find("button", "Confirm pickup").props.disabled, false);
});

test("a matched approved guardian produces a clear pickup authorization state", async () => {
  const f = fixture(async () => {}, {
    preview: false,
    scannerStatus: "ready",
    scan: async () => ({ match: true, slotId: 4, confidence: 91 }),
    identifyBiometricBySlot: async () => ({
      authorized: true,
      guardian: { id: 2, name: "Adult One", relationship: "Mother" },
    }),
  });
  await f.find("button", "Scan fingerprint").props.onClick();
  const rendered = f.text(f.render());
  assert.match(rendered, /Pickup authorized/);
  assert.match(rendered, /Adult One/);
  assert.match(rendered, /Identity and pickup permission verified/);
  assert.equal(f.find("button", "Confirm pickup").props.disabled, false);
});

test("an unknown fingerprint shows a retry state without technical scanner text", async () => {
  const f = fixture(async () => {}, {
    preview: false,
    scannerStatus: "ready",
    scan: async () => ({
      match: false,
      error: "Fingerprint does not match any enrolled guardian",
    }),
  });
  await f.find("button", "Scan fingerprint").props.onClick();
  const rendered = f.text(f.render());
  assert.match(rendered, /Fingerprint not recognized/);
  assert.match(rendered, /Try scan again/);
  assert.doesNotMatch(rendered, /NO_MATCH|slot|image-?7/i);
});

test("raw image capture codes become friendly scanner guidance", async () => {
  const f = fixture(async () => {}, {
    preview: false,
    scannerStatus: "ready",
    scan: async () => ({ match: false, error: "Scanner error: IMAGE 7" }),
  });
  await f.find("button", "Scan fingerprint").props.onClick();
  const rendered = f.text(f.render());
  assert.match(rendered, /could not read the fingerprint clearly/i);
  assert.doesNotMatch(rendered, /IMAGE 7/);
});
