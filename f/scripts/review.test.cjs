const test = require("node:test");
const assert = require("node:assert/strict");
const { clampQuantity } = require("../src/utils/cart.ts");
const { contactError } = require("../src/utils/contact.ts");
const { reports, filterReports } = require("../src/screens/reports/data.ts");

test("cart quantity respects availability, stock, and invalid input", () => {
  assert.equal(clampQuantity(4, 3), 3);
  assert.equal(clampQuantity(1, 0), 0);
  assert.equal(clampQuantity(1, 3, false), 0);
  assert.equal(clampQuantity(-1, 3), 0);
  assert.equal(clampQuantity(NaN, 3), 0);
  assert.equal(clampQuantity(2.5, 3), 2);
  assert.equal(clampQuantity(2, undefined), 2);
});
test("report filters exclude future dates and honor week/month boundaries", () => {
  assert.deepEqual(
    filterReports("Today").map((r) => r.id),
    [1],
  );
  assert.deepEqual(
    filterReports("Today", "2026-08-24").map((r) => r.id),
    [2],
  );
  assert.deepEqual(
    filterReports("This Week").map((r) => r.id),
    [1, 2],
  );
  assert.equal(filterReports("This Month", "2026-09-01").length, 0);
  assert.equal(filterReports("All").length, 4);
});
test("past reports have their own timeline and completed attendance", () => {
  const current = reports.find((r) => r.id === 1);
  const previous = reports.find((r) => r.id === 2);
  assert.equal(current.checkOut, null);
  assert.equal(previous.checkOut, "4:20 PM");
  assert.notDeepEqual(current.activities, previous.activities);
  assert.equal(previous.activities.at(-1).kind, "departure");
  assert.equal(reports.find((r) => r.id === 3).activities.length, 0);
});
test("guardian drafts require contact information without requiring optional email", () => {
  assert.equal(contactError("Test Guardian", "+251 91 123 4567", ""), "");
  assert.notEqual(contactError("", "+251 91 123 4567", ""), "");
  assert.notEqual(contactError("Test Guardian", "123", ""), "");
  assert.notEqual(
    contactError("Test Guardian", "+251 91 123 4567", "invalid"),
    "",
  );
  assert.notEqual(
    contactError("Test Parent", "+251 91 123 4567", "", true),
    "",
  );
  assert.equal(
    contactError("Test Guardian", "+251 91 123 4567", " parent@example.com "),
    "",
  );
});

const { pickupSteps } = require("../src/utils/pickup.ts");
test("pickup cannot advance without authorization and this-visit identity verification", () => {
  assert.deepEqual(pickupSteps(false), ["current", "waiting", "waiting"]);
  assert.deepEqual(pickupSteps(true), ["complete", "current", "waiting"]);
  assert.deepEqual(pickupSteps(true, true), [
    "complete",
    "complete",
    "current",
  ]);
  assert.deepEqual(pickupSteps(true, true, true), [
    "complete",
    "complete",
    "complete",
  ]);
  assert.deepEqual(pickupSteps(false, true, true), [
    "current",
    "waiting",
    "waiting",
  ]);
  assert.deepEqual(pickupSteps(true, false, true), [
    "complete",
    "current",
    "waiting",
  ]);
});
