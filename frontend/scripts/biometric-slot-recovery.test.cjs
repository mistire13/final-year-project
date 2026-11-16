const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadSerialManager() {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/services/biometricSerial.ts"),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(output, {
    module: mod,
    exports: mod.exports,
    require,
    setTimeout,
    clearTimeout,
    TextEncoder,
    TextDecoderStream,
  });
  return mod.exports.BiometricSerialManager;
}

test("clearing a stale fingerprint slot serializes the hardware operation", async () => {
  const Manager = loadSerialManager();
  const scanner = new Manager();
  const commands = [];
  const statuses = [];
  scanner.status = "ready";
  scanner.writeLine = async (line) => commands.push(line);
  scanner.nextLine = async () => "DELETED 7";
  scanner.subscribeStatus((status) => statuses.push(status));

  assert.equal(await scanner.deleteSlot(7), true);
  assert.deepEqual(commands, ["DELETE 7"]);
  assert.deepEqual(statuses, ["ready", "busy", "ready"]);
  assert.equal(scanner.isProcessing, false);
});

test("sensor deletion errors remain actionable and restore ready state", async () => {
  const Manager = loadSerialManager();
  const scanner = new Manager();
  scanner.status = "ready";
  scanner.writeLine = async () => {};
  scanner.nextLine = async () => "ERROR DELETE 16";

  await assert.rejects(
    scanner.deleteSlot(3),
    /Sensor slot could not be cleared: DELETE 16/,
  );
  assert.equal(scanner.status, "ready");
  assert.equal(scanner.isProcessing, false);
});

test("enrollment UI offers explicit recovery only for a reported occupied slot", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/portal/BiometricModals.web.tsx"),
    "utf8",
  );
  assert.match(source, /result\.error\?\.includes\("SLOT_OCCUPIED"\)/);
  assert.match(source, /Clear Sensor Slot #\$\{occupiedSlotId\}/);
  assert.match(source, /window\.confirm\(/);
  assert.match(source, /await biometricSerial\.deleteSlot\(occupiedSlotId\)/);
});
