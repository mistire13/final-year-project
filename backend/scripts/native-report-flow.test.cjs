"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  Module = require("node:module");
const { withCurrentDatabase } = require("./helpers/auth-test-database.cjs");
const ts = require("../../frontend/node_modules/typescript");
const draftModule = new Module(__filename);
draftModule._compile(
  ts.transpileModule(
    fs.readFileSync(
      require.resolve("../../frontend/src/screens/profile/reportDraft.ts"),
      "utf8",
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
  __filename,
);
const { reportPayload, reportToday } = draftModule.exports;
test("native report draft survives validation, database save and parent/admin read with all care entries", async () => {
  await withCurrentDatabase(async ({ db, pool }) => {
    await db("roles")
      .insert([
        { id: 1, name: "admin" },
        { id: 2, name: "caregiver" },
        { id: 3, name: "parent" },
      ])
      .onConflict("id")
      .ignore();
    const [center] = await db("daycares")
      .insert({
        name: "Reporting fixture",
        slug: "reporting-fixture",
        contact_email: "reports@example.invalid",
        status: "active",
      })
      .returning("*");
    const users = await db("users")
      .insert(
        ["admin", "caregiver", "parent", "other"].map((name, i) => ({
          name,
          email: `${name}@example.invalid`,
          role_id: i === 0 ? 1 : i === 1 ? 2 : 3,
          daycare_id: center.id,
          password_hash: "synthetic-unused",
        })),
      )
      .returning("*");
    const [admin, caregiver, parent, other] = users.map((u, i) => ({
      ...u,
      role: i === 0 ? "admin" : i === 1 ? "caregiver" : "parent",
    }));
    const [child] = await db("children")
      .insert({
        full_name: "Synthetic report child",
        dob: "2023-01-01",
        caregiver_id: caregiver.id,
        daycare_id: center.id,
      })
      .returning("*");
    await db("guardian_links").insert({
      child_id: child.id,
      user_id: parent.id,
      created_by: admin.id,
      relationship: "Parent",
    });
    const key = require.resolve("../src/config/db");
    require.cache[key] = {
      id: key,
      filename: key,
      loaded: true,
      exports: pool,
    };
    const service = require("../src/modules/reports/reports.service"),
      {
        createReportSchema,
      } = require("../src/modules/reports/reports.validator");
    const draft = {
      childId: child.id,
      date: reportToday(),
      sleep: "45",
      sleepNotes: "Rested after lunch",
      mood: "calm",
      behavior: "Shared blocks",
      notes: "Enjoyed the afternoon",
      meals: [
        { meal_type: "breakfast", description: " Porridge ", portion: "good" },
        { meal_type: "lunch", description: "Vegetables", portion: "fair" },
        { meal_type: "dinner", description: " ", portion: "none" },
      ],
      activities: [
        {
          activity_type: "learning",
          description: "Story time",
          location: "indoor",
        },
        {
          activity_type: "play",
          description: "Ball play",
          location: "outdoor",
        },
      ],
    };
    const payload = reportPayload(draft);
    assert.equal(createReportSchema.validate(payload).error, undefined);
    const saved = await service.createReport(payload, caregiver);
    for (const actor of [caregiver, parent, admin]) {
      const report = await service.getReport(saved.id, actor);
      assert.equal(report.meals.length, 2);
      assert.deepEqual(
        report.meals.map((m) => m.description),
        ["Porridge", "Vegetables"],
      );
      assert.equal(report.activities.length, 2);
      assert.equal(report.activities[1].location, "outdoor");
      assert.equal(report.sleep_notes, draft.sleepNotes);
      assert.equal(report.behavior_notes, draft.behavior);
      assert.equal(report.sleep_duration_min, 45);
    }
    await assert.rejects(
      service.getReport(saved.id, other),
      (e) => e.statusCode === 403,
    );
    await assert.rejects(
      service.createReport(payload, caregiver),
      (e) => e.statusCode === 409,
    );
    assert.throws(() => reportPayload({ ...draft, sleep: "1441" }), /Rest/);
    assert.throws(
      () => reportPayload({ ...draft, date: "2026-02-30" }),
      /valid report date/,
    );
    assert.throws(
      () =>
        reportPayload({
          ...draft,
          sleep: "",
          sleepNotes: "",
          behavior: "",
          notes: "",
          meals: [],
          activities: [],
        }),
      /Record/,
    );
  });
});
