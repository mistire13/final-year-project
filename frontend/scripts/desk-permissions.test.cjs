const { test } = require("node:test");
const assert = require("node:assert/strict");
const { allowedAttendance, allowedPickup } = require("../src/portal/model.ts");
const actor = { id: 2, role: "caregiver", status: "active", daycare_id: 1 };
const child = { id: 3, caregiver_id: 4, group_id: 5, daycare_id: 1 };
const now = new Date("2026-11-15T09:00:00+03:00");
const shift = {
  id: 6,
  staff_id: 2,
  daycare_id: 1,
  group_id: null,
  status: "active",
  starts_at: "2026-11-15T08:00:00+03:00",
  ends_at: "2026-11-15T10:00:00+03:00",
  can_attendance: true,
  can_pickup: true,
};

test("whole-daycare shifts permit both actions across classrooms, never across daycares", () => {
  for (const can of [allowedAttendance, allowedPickup]) {
    for (const group_id of [5, 9, null])
      assert.equal(can([shift], actor, { ...child, group_id }, now), true);
    assert.equal(can([shift], actor, { ...child, daycare_id: 9 }, now), false);
    assert.equal(can([{ ...shift, daycare_id: 9 }], actor, child, now), false);
    assert.equal(
      can([shift], { ...actor, daycare_id: undefined }, child, now),
      false,
    );
    assert.equal(
      can([shift], { ...actor, status: "inactive" }, child, now),
      false,
    );
    assert.equal(can([shift], { ...actor, role: "parent" }, child, now), false);
  }
});
test("classroom restrictions, shift boundaries and separate capabilities are enforced", () => {
  for (const can of [allowedAttendance, allowedPickup]) {
    assert.equal(can([{ ...shift, group_id: 9 }], actor, child, now), false);
    for (const status of ["revoked", "pending", "inactive"])
      assert.equal(can([{ ...shift, status }], actor, child, now), false);
    assert.equal(
      can([{ ...shift, starts_at: "invalid" }], actor, child, now),
      false,
    );
    assert.equal(can([shift], actor, child, new Date(shift.ends_at)), false);
    assert.equal(
      can([shift], actor, child, new Date("2026-11-15T07:59:00+03:00")),
      false,
    );
  }
  assert.equal(
    allowedPickup([{ ...shift, can_pickup: false }], actor, child, now),
    false,
  );
  assert.equal(
    allowedAttendance([{ ...shift, can_attendance: false }], actor, child, now),
    false,
  );
  assert.equal(
    allowedAttendance([], actor, { ...child, caregiver_id: actor.id }, now),
    true,
  );
  assert.equal(
    allowedPickup([], actor, { ...child, caregiver_id: actor.id }, now),
    false,
  );
  assert.equal(
    allowedPickup([], { ...actor, role: "admin" }, child, now),
    true,
  );
  assert.equal(
    allowedPickup(
      [],
      { ...actor, role: "admin" },
      { ...child, daycare_id: 9 },
      now,
    ),
    false,
  );
});
