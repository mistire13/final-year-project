"use strict";
// Disposable UI acceptance server. Requires local test database provisioning
// credentials; never seeds the configured application database.
const { withCurrentDatabase } = require("./helpers/auth-test-database.cjs");
const { randomBytes } = require("node:crypto");
const { createInterface } = require("node:readline");
const bcrypt = require("bcryptjs");
const { Pool, types } = require("pg");
// Match the production pool: SQL calendar dates are date strings, not instants.
types.setTypeParser(1082, (value) => value);
const { createTenantPool } = require("../src/db/tenant-pool");
const { setupRuntimeRoles } = require("./setup-runtime-roles.cjs");
withCurrentDatabase(async ({ db, pool, name }) => {
  const suffix = randomBytes(6).toString("hex");
  const roles = [
    {
      user: `ui_t_${suffix}`,
      password: randomBytes(32).toString("hex"),
      group: "ankelba_tenant",
      other: "ankelba_control",
    },
    {
      user: `ui_c_${suffix}`,
      password: randomBytes(32).toString("hex"),
      group: "ankelba_control",
      other: "ankelba_tenant",
    },
  ];
  let raw, control, server;
  try {
    await setupRuntimeRoles(pool, roles);
    const base = {
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 5432),
      database: name,
    };
    raw = new Pool({
      ...base,
      user: roles[0].user,
      password: roles[0].password,
    });
    control = new Pool({
      ...base,
      user: roles[1].user,
      password: roles[1].password,
    });
    const tenant = createTenantPool(raw);
    tenant.control = control;
    await require("../src/db/runtime-policy").verifyRuntime(raw, control);
    await db("roles")
      .insert([
        { id: 0, name: "super_admin" },
        { id: 1, name: "admin" },
        { id: 2, name: "caregiver" },
        { id: 3, name: "parent" },
      ])
      .onConflict("id")
      .ignore();
    const [center] = await db("daycares")
      .insert({
        name: "Acceptance test center",
        slug: `ui-${suffix}`,
        contact_email: "center@example.invalid",
        status: "active",
      })
      .returning("*");
    const hash = await bcrypt.hash("Synthetic-ui-test-only-123!", 4);
    const [admin, caregiver, parent, owner] = await db("users")
      .insert(
        [
          {
            name: "Test administrator",
            email: "admin@example.invalid",
            role_id: 1,
            daycare_id: center.id,
          },
          {
            name: "Test caregiver",
            email: "caregiver@example.invalid",
            role_id: 2,
            daycare_id: center.id,
          },
          {
            name: "Test parent",
            email: "parent@example.invalid",
            role_id: 3,
            daycare_id: center.id,
          },
          {
            name: "Test platform operator",
            email: "owner@example.invalid",
            role_id: 0,
            daycare_id: null,
          },
        ].map((u) => ({
          ...u,
          status: "active",
          password_hash: hash,
          profile_complete: true,
        })),
      )
      .returning("*");
    const [group] = await db("groups")
      .insert({
        name: "Test classroom",
        daycare_id: center.id,
        lead_caregiver_id: caregiver.id,
      })
      .returning("*");
    const [child] = await db("children")
      .insert({
        full_name: "Test child",
        dob: "2023-01-01",
        enrollment_status: "active",
        daycare_id: center.id,
        group_id: group.id,
        caregiver_id: caregiver.id,
      })
      .returning("*");
    await db("guardian_links").insert({
      child_id: child.id,
      user_id: parent.id,
      created_by: admin.id,
      relationship: "Parent",
      pickup_authorized: true,
    });
    const [pending] = await db("users").insert({name:"Pending test guardian",email:"pending@example.invalid",role_id:3,daycare_id:center.id,status:"active",password_hash:hash,profile_complete:true}).returning("*");
    await db("users").insert({name:"Unlinked test parent",email:"unlinked@example.invalid",role_id:3,daycare_id:center.id,status:"active",password_hash:hash,profile_complete:true});
    await db("guardian_links").insert({child_id:child.id,user_id:pending.id,created_by:admin.id,relationship:"Family",pickup_authorized:false});
    await db("emergency_contacts").insert({
      child_id: child.id,
      name: "Test contact",
      phone: "0900000000",
      relationship: "Family",
    });
    await db("announcements").insert({
      author_id: admin.id,
      title: "Family afternoon",
      body: "Join the daycare team for an afternoon of classroom activities. This is a disposable acceptance-test announcement.",
      audience: "all",
      announcement_type: "general",
      daycare_id: center.id,
    });
    await db("products").insert({
      name: "Test classroom book",
      price: 100,
      stock_qty: 20,
      available: true,
      created_by: admin.id,
      daycare_id: center.id,
    });
    await db("events").insert({
      title: "Family afternoon",
      event_date: "2040-01-01",
      event_type: "meeting",
      description: "Disposable acceptance-test event",
      created_by: admin.id,
      daycare_id: center.id,
    });
    process.env.NODE_ENV = "test";
    process.env.DAYCARE_AUTH_ENABLED = "false";
    process.env.JWT_SECRET = "synthetic-ui-acceptance-jwt-secret-only";
    const id = require.resolve("../src/config/db");
    require.cache[id] = { id, filename: id, loaded: true, exports: tenant };
    const port=Number(process.env.UI_TEST_PORT || 5000);
    server = require("../src/app").listen(port, "127.0.0.1");
    await require("node:events").once(server, "listening");
    console.log(
      `Disposable acceptance server ready at http://localhost:${port}. Type stop to clean up. Accounts: parent/caregiver/admin/owner@example.invalid. Password: Synthetic-ui-test-only-123!`,
    );
    await new Promise((resolve) => {
      const input=createInterface({input:process.stdin});
      const finish=()=>{input.close();process.stdin.destroy();process.off("SIGINT",finish);process.off("SIGTERM",finish);resolve();};
      input.on("line",line=>{if(line.trim()==="stop")finish();});
      process.once("SIGINT", finish);
      process.once("SIGTERM", finish);
    });
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
    if (raw) await raw.end();
    if (control) await control.end();
    for (const role of roles)
      if (
        (
          await pool.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [
            role.user,
          ])
        ).rows.length
      ) {
        await pool.query(`DROP OWNED BY "${role.user}"`);
        await pool.query(`DROP ROLE "${role.user}"`);
      }
  }
}).catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
