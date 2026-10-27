import React, { useState } from "react";
import {
  Dataset,
  Row,
  addDays,
  allowedDuty,
  allowedAttendance,
  attendanceStatus,
  dayOf,
  dutyState,
  localDay,
  localTime,
  metrics,
  money,
  label,
  today,
} from "./model";
import { Badge, Button, Card, Empty, Icon, Person, Table } from "./ui.web";
export type PageContext = {
  data: Dataset;
  date: string;
  query: string;
  staff: boolean;
  actor: Row;
  preview: boolean;
  go: (page: string) => void;
  open: (kind: string, row?: Row) => void;
};
const find = (rows: Row[], id: number, key = "name") =>
  rows.find((r) => r.id === id)?.[key] || "Unassigned";
export const userName = (data: Dataset, id: number) => find(data.users, id);
export const childName = (data: Dataset, id: number) =>
  find(data.children, id, "full_name");
export const groupName = (data: Dataset, id: number) => find(data.groups, id);
const search = (rows: Row[], query: string) =>
  rows.filter((r) =>
    JSON.stringify(r).toLowerCase().includes(query.trim().toLowerCase()),
  );
function Stat({
  title,
  value,
  note,
  icon,
  tint,
  ink,
}: {
  title: string;
  value: React.ReactNode;
  note: string;
  icon: string;
  tint: string;
  ink?: string;
}) {
  return (
    <Card className="p-stat">
      <div
        style={{ position: "absolute", inset: 0, background: tint, zIndex: 0 }}
      />
      <div style={{ position: "relative" }}>
        <label>{title}</label>
        <span className="p-stat-icon" style={{ color: ink }}>
          <Icon name={icon} />
        </span>
      </div>
      <b style={{ position: "relative" }}>{value}</b>
      <small style={{ position: "relative" }}>{note}</small>
    </Card>
  );
}
function AttendanceChart({
  data,
  date,
  days = 7,
  group = "",
}: {
  data: Dataset;
  date: string;
  days?: number;
  group?: string;
}) {
  const series = Array.from({ length: days }, (_, i) => {
    const day = addDays(date, i - days + 1);
    const m = metrics(data, day, group);
    return { day, value: m.present + m.collected, absent: m.absent };
  });
  const max = Math.max(4, ...series.map((s) => s.value + s.absent));
  const x = (i: number) => 45 + i * (570 / (days - 1 || 1));
  const y = (value: number) => 155 - (value / max) * 125;
  const points = series.map((s, i) => `${x(i)},${y(s.value)}`).join(" ");
  return (
    <>
      <svg
        className="p-chart"
        viewBox="0 0 650 185"
        role="img"
        aria-label={`Daily children attending: ${series.map((s) => s.day + ": " + s.value).join(", ")}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="attendance-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#b4cbb2" stopOpacity=".38" />
            <stop offset="1" stopColor="#f9fbf7" stopOpacity=".1" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              x1="42"
              x2="626"
              y1={30 + i * 42}
              y2={30 + i * 42}
              stroke="#edf0e9"
              strokeDasharray="3 5"
            />
            <text x="10" y={34 + i * 42}>
              {Math.round(max * (1 - i / 3))}
            </text>
          </g>
        ))}
        <polygon
          points={`45,155 ${points} 615,155`}
          fill="url(#attendance-fill)"
        />
        <polyline
          points={points}
          fill="none"
          stroke="#7ba083"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {series.map((s, i) => (
          <g key={s.day}>
            {days <= 7 && (
              <circle
                cx={x(i)}
                cy={y(s.value)}
                r="3.5"
                fill="#fff"
                stroke="#7ba083"
                strokeWidth="2"
              />
            )}
            {(days <= 7 || i % 5 === 0 || i === days - 1) && (
              <text x={x(i)} y="182" textAnchor="middle">
                {new Date(s.day + "T12:00:00Z").toLocaleDateString("en", {
                  [days <= 7 ? "weekday" : "day"]: "short" as any,
                  ...(days > 7 ? { day: "numeric" } : {}),
                })}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="p-legend">
        <span>
          <i className="p-dot" />
          Attended (including collected)
        </span>
        <span>Daily unique children</span>
      </div>
    </>
  );
}
export function Overview(ctx: PageContext) {
  const { data, date, go, open, staff, actor } = ctx;
  const m = metrics(data, date);
  const reportRate = m.total ? Math.round((m.submitted / m.total) * 100) : 0;
  const lowStock = data.products.filter((p) => p.stock_qty <= 5).length;
  const health = data.health.filter((h) => !h.parent_notified).length;
  return (
    <>
      <div className="p-grid stats">
        <Stat
          title="Enrolled children"
          value={m.total}
          note={`${data.groups.length} groups, growing together`}
          icon="child"
          tint="#eff3e8"
        />
        <Stat
          title="At daycare"
          value={m.present}
          note={`${m.absent} absent · ${m.pending} not marked`}
          icon="heart"
          tint="#f9eedb"
          ink="#ac8c4a"
        />
        <Stat
          title="Reports submitted"
          value={
            <>
              {m.submitted}
              <span style={{ fontSize: 16, color: "#a0a1a4" }}>
                {" "}
                / {m.total}
              </span>
            </>
          }
          note={`${reportRate}% of active children`}
          icon="file"
          tint="#efeef7"
          ink="#9c91ba"
        />
        <Stat
          title="Safe pickups"
          value={m.collected}
          note="Recorded check-outs for selected day"
          icon="shield"
          tint="#eaf2f4"
          ink="#7e9fab"
        />
      </div>
      <div className="p-grid main">
        <Card>
          <div className="p-card-head">
            <div>
              <h2>Little steps, every day</h2>
              <p>Attendance across the last seven days</p>
            </div>
            <Button variant="quiet" onClick={() => go("analytics")}>
              View analytics <Icon name="arrow" size={15} />
            </Button>
          </div>
          <AttendanceChart data={data} date={date} />
        </Card>
        <Card>
          <div className="p-card-head">
            <div>
              <h2>A little attention needed</h2>
              <p>The things worth a closer look</p>
            </div>
            <Icon name="bell" size={19} />
          </div>
          {[
            {
              n: m.missing,
              t: "Daily reports remaining",
              s: "Keep families connected to their day",
              go: "reports",
              icon: "file",
            },
            {
              n: health,
              t: "Parent updates pending",
              s: "Health and incident communication",
              go: "health",
              icon: "heart",
            },
            {
              n: lowStock,
              t: "Items running low",
              s: "Review daycare essentials",
              go: "store",
              icon: "store",
            },
          ].map((item) => (
            <div className="p-attention" key={item.go}>
              <span className="p-icon-tile">
                <Icon name={item.icon} size={17} />
              </span>
              <div>
                <strong>
                  {item.n} {item.t.toLowerCase()}
                </strong>
                <p>{item.s}</p>
              </div>
              <button
                className="p-icon-button"
                aria-label={"Review " + item.t.toLowerCase()}
                onClick={() => go(item.go)}
              >
                <Icon name="arrow" size={17} />
              </button>
            </div>
          ))}
        </Card>
      </div>
      <div className="p-grid main">
        <Card>
          <div className="p-card-head">
            <div>
              <h2>Today at a glance</h2>
              <p>Children, caregivers and little daily moments</p>
            </div>
            <Button variant="quiet" onClick={() => go("attendance")}>
              All attendance <Icon name="arrow" size={15} />
            </Button>
          </div>
          <Table
            pageSize={6}
            rows={m.rows.map(({ child, status }) => {
              const guardian = data.guardians.find((g) => g.child_id === child.id);
              const parentUser = guardian ? data.users.find((u) => u.id === guardian.user_id) : null;
              const parentName = child.parent_name || parentUser?.name;
              const parentEmail = child.parent_email || parentUser?.email;
              const parentRel = child.parent_relationship || guardian?.relationship || "Parent";
              const verification = data.verifications.find((v) => v.child_id === child.id && (status?.event_type === "checkout"));
              const collectedBy = verification ? verification.guardian_name || userName(data, verification.guardian_user_id) : parentName;
              return {
                ...child,
                parentName,
                parentEmail,
                parentRel,
                collectedBy,
                event_type: status?.event_type || "not_marked",
                event_time: status?.event_time,
              };
            })}
            columns={[
              {
                key: "full_name",
                title: "Child",
                render: (r) => (
                  <Person
                    name={r.full_name}
                    sub={groupName(data, r.group_id)}
                  />
                ),
              },
              {
                key: "parentName",
                title: "Parent / Guardian",
                render: (r) => r.parentName ? (
                  <div>
                    <strong style={{ fontSize: "13px" }}>{r.parentName}</strong>{" "}
                    <span style={{ fontSize: "11px", color: "#6B7280" }}>({r.parentRel})</span>
                    {r.parentEmail && <div style={{ fontSize: "11px", color: "#6B7280" }}>{r.parentEmail}</div>}
                  </div>
                ) : <span style={{ color: "#9CA3AF" }}>—</span>,
              },
              {
                key: "event_type",
                title: "Status",
                render: (r) => {
                  if (r.event_type === "checkin") return <Badge value="At daycare" tone="green" />;
                  if (r.event_type === "checkout") return <Badge value={r.collectedBy ? `✓ Picked up by ${r.collectedBy}` : "✓ Checked out"} tone="blue" />;
                  if (r.event_type === "absent") return <Badge value="Absent" tone="gold" />;
                  return <Badge value="Not marked" tone="quiet" />;
                },
              },
              {
                key: "event_time",
                title: "Time",
                render: (r) => r.event_time ? localTime(r.event_time) : "—",
              },
              {
                key: "actions",
                title: "Front Desk Action",
                render: (r) => (
                  <div className="p-row-actions">
                    {r.event_type === "not_marked" ? (
                      (!staff || allowedDuty(data.duties, actor?.id, r.group_id, "attendance")) ? (
                        <Button variant="secondary small" onClick={() => open("checkin", r)}>Check in</Button>
                      ) : null
                    ) : r.event_type === "checkin" ? (
                      (!staff || allowedDuty(data.duties, actor?.id, r.group_id, "pickup")) ? (
                        <Button variant="secondary small" onClick={() => open("pickup", r)}>Verify & Checkout</Button>
                      ) : null
                    ) : (
                      <Button variant="quiet" onClick={() => open("child-profile", r)}>Profile</Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </Card>
        <Card>
          <div className="p-card-head">
            <div>
              <h2>Our groups</h2>
              <p>Daily report completion</p>
            </div>
            <Button variant="quiet" onClick={() => go("groups")}>
              View all
            </Button>
          </div>
          {data.groups.map((g) => {
            const s = metrics(data, date, String(g.id));
            return (
              <div key={g.id} className="p-group-row">
                <div>
                  <strong>{g.name}</strong>
                  <small>
                    {s.submitted}/{s.total} reports
                  </small>
                </div>
                <div className="p-progress">
                  <span
                    style={{
                      width: `${s.total ? (s.submitted / s.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
          <div className="p-notice" style={{ marginTop: 26, marginBottom: 0 }}>
            Every update helps a family feel a little closer.
          </div>
        </Card>
      </div>

      <Card className="p-families-card">
        <div className="p-card-head">
          <div>
            <h2>Families & children from parent registration</h2>
            <p>Live parent accounts, child enrollment, groups, allergies, and daily check-in / check-out status</p>
          </div>
          <Button variant="quiet" onClick={() => go("children")}>
            View full registry <Icon name="arrow" size={15} />
          </Button>
        </div>
        <Table
          pageSize={6}
          rows={data.children.map((c) => {
            const guardian = data.guardians.find((g) => g.child_id === c.id);
            const parentUser = guardian ? data.users.find((u) => u.id === guardian.user_id) : null;
            const parentName = c.parent_name || parentUser?.name || "Unlinked";
            const parentEmail = c.parent_email || parentUser?.email || "—";
            const relationship = c.parent_relationship || guardian?.relationship || "Parent";
            const allergies = (c.care_instructions || []).filter((ci: any) => ci.category === "allergy");
            const allergyText = allergies.length > 0
              ? allergies.map((a: any) => a.instruction_text.split("—")[0].trim()).join(", ")
              : "No known allergies";
            const att = m.rows.find((mr) => mr.child.id === c.id);
            const event_type = att?.status?.event_type || "not_marked";
            const event_time = att?.status?.event_time;
            const verification = data.verifications.find((v) => v.child_id === c.id && event_type === "checkout");
            const collectedBy = verification ? verification.guardian_name || userName(data, verification.guardian_user_id) : parentName;
            return {
              ...c,
              parentDisplay: `${parentName} (${relationship})`,
              parentEmail,
              allergyText,
              hasAllergies: allergies.length > 0,
              event_type,
              event_time,
              collectedBy,
            };
          })}
          columns={[
            {
              key: "full_name",
              title: "Child Name",
              render: (r) => (
                <Person
                  name={r.full_name}
                  sub={`DOB: ${dayOf(r.dob)} · ${groupName(data, r.group_id)}`}
                />
              ),
            },
            {
              key: "parentDisplay",
              title: "Parent / Guardian",
              render: (r) => (
                <div>
                  <strong style={{ fontSize: "13px" }}>{r.parentDisplay}</strong>
                  <div style={{ fontSize: "11px", color: "#6B7280" }}>{r.parentEmail}</div>
                </div>
              ),
            },
            {
              key: "allergyText",
              title: "Allergies & Dietary",
              render: (r) => (
                <Badge
                  value={r.allergyText}
                  tone={r.hasAllergies ? "gold" : "green"}
                />
              ),
            },
            {
              key: "event_type",
              title: "Today's Attendance",
              render: (r) => {
                if (r.event_type === "checkin") return <Badge value="At daycare" tone="green" />;
                if (r.event_type === "checkout") return <Badge value={r.collectedBy ? `✓ Picked up by ${r.collectedBy}` : "✓ Checked out"} tone="blue" />;
                if (r.event_type === "absent") return <Badge value="Absent" tone="gold" />;
                return <Badge value="Not marked" tone="quiet" />;
              },
            },
            {
              key: "actions",
              title: "Actions",
              render: (r) => (
                <div className="p-row-actions">
                  {r.event_type === "not_marked" ? (
                    (!staff || allowedDuty(data.duties, actor?.id, r.group_id, "attendance")) ? (
                      <Button variant="secondary small" onClick={() => open("checkin", r)}>Check in</Button>
                    ) : null
                  ) : r.event_type === "checkin" ? (
                    (!staff || allowedDuty(data.duties, actor?.id, r.group_id, "pickup")) ? (
                      <Button variant="secondary small" onClick={() => open("pickup", r)}>Checkout</Button>
                    ) : null
                  ) : null}
                  <Button variant="quiet" onClick={() => open("child-profile", r)}>
                    Profile
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <div className="p-grid main">
        <Card>
          <div className="p-card-head">
            <div>
              <h2>Front-desk coverage</h2>
              <p>Personal logins. Clear responsibilities.</p>
            </div>
            <Button variant="quiet" onClick={() => go("front-desk")}>
              Manage duties <Icon name="arrow" size={15} />
            </Button>
          </div>
          {data.duties.filter((d) => localDay(d.starts_at) === date).length ? (
            data.duties
              .filter((d) => localDay(d.starts_at) === date)
              .map((d) => (
                <div className="p-attention" key={d.id}>
                  <Person
                    name={userName(data, d.staff_id)}
                    sub={`${localTime(d.starts_at)} – ${localTime(d.ends_at)}`}
                  />
                  <div style={{ flex: 1 }} />
                  <Badge value={dutyState(d)} />
                </div>
              ))
          ) : (
            <Empty
              title="No desk coverage"
              text="Assign a caregiver for this day."
            />
          )}
        </Card>
        <Card>
          <div className="p-card-head">
            <h2>Coming up</h2>
            <Button variant="quiet" onClick={() => go("events")}>
              Calendar
            </Button>
          </div>
          {data.events
            .filter((e) => !e.cancelled && dayOf(e.event_date) >= date)
            .slice(0, 2)
            .map((e) => (
              <div className="p-event" key={e.id}>
                <div className="p-date-tile">
                  {new Date(e.event_date).toLocaleDateString("en", {
                    month: "short",
                  })}
                  <b>{Number(dayOf(e.event_date).slice(-2))}</b>
                </div>
                <div>
                  <h3>{e.title}</h3>
                  <p>
                    {label(e.event_type)} ·{" "}
                    {e.event_time?.slice(0, 5) || "All day"}
                  </p>
                </div>
              </div>
            ))}
        </Card>
      </div>
    </>
  );
}
export function Analytics({ data, date }: PageContext) {
  const [days, setDays] = useState(7);
  const [group, setGroup] = useState("");
  const m = metrics(data, date, group);
  const dates = Array.from({ length: days }, (_, i) => addDays(date, -i));
  const childIds = new Set(m.rows.map((r) => r.child.id));
  const sample = dates.map((d) => metrics(data, d, group));
  const attendanceDays = sample.reduce(
    (n, s) => n + s.present + s.collected,
    0,
  );
  const paid = data.orders.filter(
    (o) =>
      o.payment_status === "paid" && o.payment_method !== 'demo' && dates.includes(localDay(o.created_at)),
  );
  const submitted = data.reports.filter(
    (r) => childIds.has(r.child_id) && dates.includes(dayOf(r.report_date)),
  ).length;
  return (
    <>
      <div className="p-filters">
        <div className="p-tabs" style={{ margin: 0 }}>
          {[7, 30].map((n) => (
            <button
              key={n}
              className={days === n ? "active" : ""}
              aria-pressed={days === n}
              onClick={() => setDays(n)}
            >
              Last {n} days
            </button>
          ))}
        </div>
        <select
          aria-label="Analytics group"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
        >
          <option value="">All groups</option>
          {data.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
      <div className="p-grid stats">
        <Stat
          title="Child attendance days"
          value={attendanceDays}
          note={`${days} calendar days · unique child/day`}
          icon="calendar"
          tint="#eff3e8"
        />
        <Stat
          title="Reports recorded"
          value={submitted}
          note="Within selected group and date range"
          icon="file"
          tint="#efedf6"
        />
        <Stat
          title="Paid order value"
          value={money(paid.reduce((n, o) => n + Number(o.total), 0))}
          note="Center-wide · by order creation date"
          icon="store"
          tint="#faf0df"
        />
        <Stat
          title="Parent updates pending"
          value={
            data.health.filter(
              (h) =>
                !h.parent_notified &&
                childIds.has(h.child_id) &&
                dates.includes(localDay(h.recorded_at)),
            ).length
          }
          note="Health records in selected range"
          icon="heart"
          tint="#f8eae7"
        />
      </div>
      <div className="p-grid main">
        <Card>
          <div className="p-card-head">
            <div>
              <h2>Attendance trend</h2>
              <p>
                {addDays(date, 1 - days)} through {date}
              </p>
            </div>
            <Badge value={`${m.total} active children`} tone="green" />
          </div>
          <AttendanceChart data={data} date={date} days={days} group={group} />
          <p className="p-kpi-note">
            Current active enrollment is used for group membership. This chart
            shows recorded attendance, not a forecast.
          </p>
        </Card>
        <Card>
          <h2>Selected-day attendance</h2>
          {[
            { n: m.present, l: "At daycare", c: "#8eae92" },
            { n: m.collected, l: "Collected", c: "#b6c9d2" },
            { n: m.absent, l: "Absent", c: "#e5b49e" },
            { n: m.pending, l: "Not marked", c: "#e7d29d" },
          ].map((s) => (
            <div className="p-group-row" key={s.l}>
              <div>
                <strong>{s.l}</strong>
                <small>{s.n} children</small>
              </div>
              <div className="p-progress">
                <span
                  style={{
                    background: s.c,
                    width: `${m.total ? (s.n / m.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </Card>
      </div>
      <Card>
        <div className="p-card-head">
          <div>
            <h2>Caregiver reporting</h2>
            <p>Selected-day completion by assigned active children</p>
          </div>
        </div>
        <Table
          rows={data.users
            .filter((u) => u.role === "caregiver")
            .map((u) => {
              const kids = m.rows
                .filter((r) => r.child.caregiver_id === u.id)
                .map((r) => r.child.id);
              const count = kids.filter((id) =>
                data.reports.some(
                  (r) => r.child_id === id && dayOf(r.report_date) === date,
                ),
              ).length;
              return {
                ...u,
                assigned: kids.length,
                submitted: count,
                missing: kids.length - count,
              };
            })}
          columns={[
            {
              key: "name",
              title: "Caregiver",
              render: (r) => <Person name={r.name} />,
            },
            { key: "assigned", title: "Assigned children" },
            { key: "submitted", title: "Reports submitted" },
            {
              key: "missing",
              title: "Remaining",
              render: (r) => (
                <Badge
                  value={
                    r.missing === 0 ? "complete" : `${r.missing} remaining`
                  }
                  tone={r.missing ? "gold" : "green"}
                />
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
export function Caregivers(ctx: PageContext) {
  const { data, query, open } = ctx;
  const [status, setStatus] = useState("");
  const caregivers = data.users.filter((u) => u.role === "caregiver");
  const rows = search(
    caregivers.filter((u) => !status || u.status === status),
    query,
  );
  return (
    <Card>
      <div className="p-card-head">
        <div>
          <h2>Caregivers & Staff Members</h2>
          <p>
            {rows.length} professional educators and caregivers supporting child development
          </p>
        </div>
        <Button icon="plus" onClick={() => open("caregiver", { id: 0, role: "caregiver" })}>
          Register Caregiver
        </Button>
      </div>
      <div className="p-filters">
        <select
          aria-label="Caregiver status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <Table
        rows={rows}
        columns={[
          {
            key: "name",
            title: "Staff Member",
            render: (r) => (
              <Person
                name={r.name}
                sub={r.email + (r.phone ? " · Tel: " + r.phone : "")}
              />
            ),
          },
          {
            key: "title",
            title: "Role & Shift",
            render: (r) => (
              <div>
                <strong style={{ fontSize: "13px", color: "var(--navy)" }}>{r.title || "Caregiver / Educator"}</strong>
                {r.shift && (
                  <div style={{ fontSize: "11px", color: "#6B7280", marginTop: "2px", display: "flex", alignItems: "center", gap: 4 }}>
                    <Icon name="clock" size={12} /> {r.shift}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: "qualifications",
            title: "Qualifications & Credentials",
            render: (r) =>
              r.qualifications ? (
                <div style={{ fontSize: "12px", color: "#374151", maxWidth: 240, lineHeight: "1.3" }}>
                  {r.qualifications}
                </div>
              ) : (
                <span style={{ color: "#9CA3AF" }}>—</span>
              ),
          },
          {
            key: "linked",
            title: "Assigned Children",
            render: (r) => {
              const assigned = data.children.filter((c) => c.caregiver_id === r.id && c.enrollment_status === "active");
              const count = assigned.length;
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Badge
                    value={`${count} ${count === 1 ? "child" : "children"}`}
                    tone={count > 0 ? "green" : "quiet"}
                  />
                  <Button variant="quiet small" onClick={() => open("assign-caregiver", r)}>
                    Assign
                  </Button>
                </div>
              );
            },
          },
          {
            key: "emergency_contact",
            title: "Staff Emergency Contact",
            render: (r) =>
              r.emergency_contact ? (
                <span style={{ fontSize: "12px", color: "#4B5563", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Icon name="phone" size={12} /> {r.emergency_contact}
                </span>
              ) : (
                <span style={{ color: "#9CA3AF" }}>—</span>
              ),
          },
          {
            key: "status",
            title: "Account",
            render: (r) => <Badge value={r.status} />,
          },
          {
            key: "actions",
            title: "Actions",
            render: (r) => (
              <div className="p-row-actions">
                <Button variant="secondary small" onClick={() => open("assign-caregiver", r)}>
                  Assign Students
                </Button>
                <Button variant="quiet" onClick={() => open("caregiver", r)}>
                  Edit Profile
                </Button>
                <Button variant="quiet" onClick={() => open("user-status", r)}>
                  {r.status === "active" ? "Deactivate" : "Activate"}
                </Button>
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
}
export const Registry = Caregivers;

export function Children(ctx: PageContext) {
  const { data, query, open } = ctx;
  const [group, setGroup] = useState("");
  const [status, setStatus] = useState("");
  const pendingRequests = (data.guardianRequests || []).filter((g) => g.status === "pending");
  return (
    <>
      {pendingRequests.length > 0 && (
        <Card className="p-guardian-requests">
          <div className="p-card-head">
            <div>
              <h2 style={{ fontSize: 16 }}>Pending pickup requests ({pendingRequests.length})</h2>
              <p>Parent-submitted pickup contacts awaiting review and identity verification before collection authorization.</p>
            </div>
          </div>
          <Table
            pageSize={5}
            rows={pendingRequests}
            columns={[
              {
                key: "child",
                title: "Child",
                render: (r) => <Person name={childName(data, r.child_id)} sub={`Child ID: ${r.child_id}`} />,
              },
              {
                key: "name",
                title: "Requested contact",
                render: (r) => <Person name={r.name} sub={`${r.relationship} · ${r.phone}`} />,
              },
              {
                key: "status",
                title: "Review status",
                render: () => <Badge value="Pending review" tone="gold" />,
              },
              {
                key: "actions",
                title: "Action",
                render: (r) => (
                  <Button variant="secondary small" onClick={() => open("guardian-request-review", r)}>
                    Review request
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      )}
      <Card>
        <div className="p-card-head">
        <div>
          <h2>Children & Families</h2>
          <p>Enrolled children, linked guardians, emergency contacts and medical notes</p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Button icon="plus" onClick={() => open("family")}>
            Enroll New Family
          </Button>
          <Button variant="secondary" onClick={() => open("child")}>
            Add Sibling / Child
          </Button>
        </div>
      </div>
      <div className="p-filters">
        <select
          aria-label="Child group"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
        >
          <option value="">All groups</option>
          {data.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Enrollment status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All enrollment</option>
          {["active", "waitlist", "inactive"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <Table
        rows={search(
          data.children.filter(
            (c) =>
              (!group || String(c.group_id) === group) &&
              (!status || c.enrollment_status === status),
          ),
          query,
        )}
        columns={[
          {
            key: "full_name",
            title: "Child",
            render: (r) => (
              <Person name={r.full_name} sub={"Born " + dayOf(r.dob)} />
            ),
          },
          {
            key: "group_id",
            title: "Group",
            render: (r) => groupName(data, r.group_id),
          },
          {
            key: "parent_name",
            title: "Parent / Guardian",
            render: (r) => {
              const guardian = data.guardians.find((g) => g.child_id === r.id);
              const parentUser = guardian ? data.users.find((u) => u.id === guardian.user_id) : null;
              const name = r.parent_name || parentUser?.name;
              const email = r.parent_email || parentUser?.email;
              const rel = r.parent_relationship || guardian?.relationship;
              const phone = r.parent_phone || parentUser?.phone || (r.emergency_contacts && r.emergency_contacts[0]?.phone);
              if (!name) return <span style={{ color: "#9CA3AF" }}>Unlinked</span>;
              return (
                <div>
                  <div style={{ fontWeight: 600, fontSize: "13px" }}>{name} {rel ? `(${rel})` : ""}</div>
                  {phone && (
                    <div style={{ fontSize: "11px", color: "var(--navy)", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                      <Icon name="phone" size={12} /> {phone}
                    </div>
                  )}
                  {email && <div style={{ fontSize: "11px", color: "#6B7280" }}>{email}</div>}
                </div>
              );
            },
          },
          {
            key: "care_instructions",
            title: "Allergies & Care",
            render: (r) => {
              const allergies = (r.care_instructions || []).filter((c: any) => c.category === "allergy");
              if (allergies.length > 0) {
                return (
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                    {allergies.map((a: any, i: number) => (
                      <Badge key={i} value={a.instruction_text.split("—")[0].trim()} tone="gold" />
                    ))}
                  </div>
                );
              }
              return <span style={{ fontSize: "12px", color: "#10B981", fontWeight: 600 }}>✓ No known allergies</span>;
            },
          },
          {
            key: "caregiver_id",
            title: "Caregiver",
            render: (r) => {
              const name = userName(data, r.caregiver_id);
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: "13px", fontWeight: name ? 600 : 400, color: name ? "var(--navy)" : "#9CA3AF" }}>
                    {name || "Unassigned"}
                  </span>
                  <Button variant="quiet small" onClick={() => open("assign-child-caregiver", r)}>
                    Edit
                  </Button>
                </div>
              );
            },
          },
          {
            key: "enrollment_status",
            title: "Enrollment",
            render: (r) => <Badge value={r.enrollment_status} />,
          },
          {
            key: "actions",
            title: "Manage",
            render: (r) => (
              <div className="p-row-actions">
                <Button variant="quiet" onClick={() => open("child-profile", r)}>Profile</Button>
                <Button variant="secondary small" onClick={() => open("assign-child-caregiver", r)}>
                  Caregiver
                </Button>
                <Button variant="quiet" onClick={() => open("child", r)}>
                  Edit
                </Button>
                <Button variant="quiet" onClick={() => open("guardian", r)}>
                  Link guardian
                </Button>
              </div>
            ),
          },
        ]}
      />
    </Card>
    </>
  );
}
export function Groups(ctx: PageContext) {
  const { data, query, open, date } = ctx;
  return (
    <>
      <div
        className="p-head-actions"
        style={{ justifyContent: "flex-end", marginBottom: 20 }}
      >
        <Button icon="plus" onClick={() => open("group")}>
          Create group
        </Button>
      </div>
      <div
        className="p-grid"
        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))" }}
      >
        {search(data.groups, query).map((g) => {
          const m = metrics(data, date, String(g.id));
          return (
            <Card key={g.id}>
              <div className="p-card-head">
                <span className="p-avatar">
                  <Icon name="leaf" />
                </span>
                <Button variant="quiet" onClick={() => open("group", g)}>
                  Edit group
                </Button>
              </div>
              <h2>{g.name}</h2>
              <p style={{ fontSize: 12 }}>
                {g.description || "Learning and growing, together."}
              </p>
              <div style={{ marginTop: 10, marginBottom: 12, padding: "8px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>
                  Lead Teacher / Caregiver
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)", marginTop: 2, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>{g.lead_caregiver_name || userName(data, g.lead_caregiver_id) || "Not assigned"}</span>
                  <Button variant="quiet small" onClick={() => open("assign-group-caregiver", g)}>
                    Assign
                  </Button>
                </div>
              </div>
              <div className="p-detail-grid">
                <div>
                  <small>Active children</small>
                  <strong>{m.total}</strong>
                </div>
                <div>
                  <small>At daycare</small>
                  <strong>{m.present}</strong>
                </div>
              </div>
              <div className="p-group-row">
                <div>
                  <small>Daily reports</small>
                  <small>
                    {m.submitted}/{m.total}
                  </small>
                </div>
                <div className="p-progress">
                  <span
                    style={{
                      width: `${m.total ? (m.submitted / m.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Button variant="secondary" style={{ flex: 1 }} onClick={() => open("assign-group-caregiver", g)}>
                  Assign Caregiver
                </Button>
                <Button variant="quiet" onClick={() => ctx.go("children")}>
                  Manage Roster
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
export function Duties(ctx: PageContext) {
  const { data, date, query, open } = ctx;
  return (
    <Card>
      <div className="p-card-head">
        <div>
          <h2>The right people, at the right time</h2>
          <p>Assignments are separate from classroom responsibilities.</p>
        </div>
        <Button icon="plus" onClick={() => open("duty")}>
          Assign staff
        </Button>
      </div>
      <div className="p-notice">
        Staff use their own credentials. Access is limited by shift, group and
        the actions you assign.
      </div>
      <Table
        rows={search(
          data.duties
            .map((d): Row => ({ ...d, name: userName(data, d.staff_id) }))
            .filter((d) => localDay(d.starts_at) === date),
          query,
        )}
        columns={[
          {
            key: "name",
            title: "Staff member",
            render: (r) => <Person name={r.name} />,
          },
          {
            key: "starts_at",
            title: "Shift · Addis Ababa",
            render: (r) =>
              `${localTime(r.starts_at)} – ${localTime(r.ends_at)}`,
          },
          {
            key: "group_id",
            title: "Scope",
            render: (r) =>
              r.group_id ? groupName(data, r.group_id) : "All groups",
          },
          {
            key: "capabilities",
            title: "Responsibilities",
            render: (r) =>
              [
                r.can_attendance ? "Attendance" : "",
                r.can_pickup ? "Pickup" : "",
              ]
                .filter(Boolean)
                .join(" + "),
          },
          {
            key: "status",
            title: "Status",
            render: (r) => <Badge value={dutyState(r)} />,
          },
          {
            key: "actions",
            title: "Actions",
            render: (r) => (
              <Button
                variant="quiet"
                disabled={r.status === "revoked"}
                onClick={() => open("revoke-duty", r)}
              >
                Revoke
              </Button>
            ),
          },
        ]}
      />
    </Card>
  );
}
export function Attendance(ctx: PageContext) {
  const { data, date, query, open, staff, actor } = ctx;
  const [status, setStatus] = useState("");
  const m = metrics(data, date);
  const editable = date === today();
  return (
    <>
      <div className="p-grid stats">
        <Stat
          title="At daycare"
          value={m.present}
          note="Children currently checked in"
          icon="child"
          tint="#eff3e8"
        />
        <Stat
          title="Collected"
          value={m.collected}
          note="Completed check-outs"
          icon="shield"
          tint="#eaf2f4"
        />
        <Stat
          title="Absent"
          value={m.absent}
          note="Recorded for selected day"
          icon="calendar"
          tint="#faf0df"
        />
        <Stat
          title="Not marked"
          value={m.pending}
          note="Awaiting attendance"
          icon="clock"
          tint="#efedf6"
        />
      </div>
      {staff && (
        <div className="p-notice">
          Your assigned groups only. Shift permissions are rechecked on every
          action.
        </div>
      )}
      <Card>
        <div className="p-card-head">
          <h2>{staff ? "Your front desk" : "Daily attendance"}</h2>
          <select
            aria-label="Attendance status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {["checkin", "checkout", "absent", "not_marked"].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </div>
        <Table
          rows={search(
            m.rows
              .map(({ child, status }) => {
                const guardian = data.guardians.find((g) => g.child_id === child.id);
                const parentUser = guardian ? data.users.find((u) => u.id === guardian.user_id) : null;
                const parentName = child.parent_name || parentUser?.name;
                const parentEmail = child.parent_email || parentUser?.email;
                const parentRel = child.parent_relationship || guardian?.relationship || "Parent";
                const verification = data.verifications.find((v) => v.child_id === child.id && (status?.event_type === "checkout"));
                const collectedBy = verification ? verification.guardian_name || userName(data, verification.guardian_user_id) : parentName;
                const allergies = (child.care_instructions || []).filter((ci: any) => ci.category === "allergy");
                return {
                  ...child,
                  parentName,
                  parentEmail,
                  parentRel,
                  collectedBy,
                  allergies,
                  event_type: status?.event_type || "not_marked",
                  event_time: status?.event_time,
                };
              })
              .filter((r) => !status || r.event_type === status),
            query,
          )}
          columns={[
            {
              key: "full_name",
              title: "Child",
              render: (r) => (
                <Person name={r.full_name} sub={groupName(data, r.group_id)} />
              ),
            },
            {
              key: "parentName",
              title: "Parent / Guardian",
              render: (r) => r.parentName ? (
                <div>
                  <strong style={{ fontSize: "13px" }}>{r.parentName}</strong>{" "}
                  <span style={{ fontSize: "11px", color: "#6B7280" }}>({r.parentRel})</span>
                  {r.parentEmail && <div style={{ fontSize: "11px", color: "#6B7280" }}>{r.parentEmail}</div>}
                </div>
              ) : <span style={{ color: "#9CA3AF" }}>Unlinked</span>,
            },
            {
              key: "allergies",
              title: "Safety & Care",
              render: (r) => {
                if (r.allergies && r.allergies.length > 0) {
                  return (
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {r.allergies.map((a: any, i: number) => (
                        <Badge key={i} value={a.instruction_text.split("—")[0].trim()} tone="gold" />
                      ))}
                    </div>
                  );
                }
                return <span style={{ fontSize: "12px", color: "#6B7280" }}>No care alerts recorded</span>;
              },
            },
            {
              key: "event_type",
              title: "Attendance Status",
              render: (r) => {
                if (r.event_type === "checkin") return <Badge value="At daycare" tone="green" />;
                if (r.event_type === "checkout") return <Badge value={r.collectedBy ? `✓ Picked up by ${r.collectedBy}` : "✓ Checked out"} tone="blue" />;
                if (r.event_type === "absent") return <Badge value="Absent" tone="gold" />;
                return <Badge value="Not marked" tone="quiet" />;
              },
            },
            {
              key: "event_time",
              title: "Last update",
              render: (r) => r.event_time ? localTime(r.event_time) : "—",
            },
            {
              key: "actions",
              title: "Front Desk Actions",
              render: (r) => (
                <div className="p-row-actions">
                  {r.event_type === "not_marked" ? (
                    (!staff || allowedAttendance(data.duties, actor, r)) ? (
                      <>
                        <Button
                          variant="secondary small"
                          disabled={!editable}
                          onClick={() => open("checkin", r)}
                        >
                          Check in
                        </Button>
                        <Button
                          variant="quiet"
                          disabled={!editable}
                          onClick={() => open("absent", r)}
                        >
                          Absent
                        </Button>
                      </>
                    ) : null
                  ) : r.event_type === "checkin" ? (
                    (!staff || allowedDuty(data.duties, actor.id, r.group_id, "pickup")) ? (
                      <Button
                        variant="secondary small"
                        disabled={!editable}
                        onClick={() => open("pickup", r)}
                      >
                        Verify pickup
                      </Button>
                    ) : null
                  ) : (
                    <>
                      <Button
                        variant="quiet"
                        onClick={() => open("child-profile", r)}
                      >
                        Profile
                      </Button>
                      <Button
                        variant="quiet"
                        onClick={() => open("attendance-history", r)}
                      >
                        History
                      </Button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>
    </>
  );
}
export function Reports(ctx: PageContext) {
  const { data, date, query, open } = ctx;
  const [mode, setMode] = useState("submitted");
  const rows = data.children
    .filter((c) => c.enrollment_status === "active")
    .map((c) => ({
      ...c,
      report: data.reports.find(
        (r) => r.child_id === c.id && dayOf(r.report_date) === date,
      ),
    }));
  return (
    <Card>
      <div className="p-card-head">
        <div>
          <h2>Every child's day, thoughtfully recorded</h2>
          <p>Report completion for {date}</p>
        </div>
      </div>
      <div className="p-tabs">
        {["submitted", "missing"].map((t) => (
          <button
            className={mode === t ? "active" : ""}
            aria-pressed={mode === t}
            key={t}
            onClick={() => setMode(t)}
          >
            {label(t)} (
            {
              rows.filter((r) => (t === "submitted" ? r.report : !r.report))
                .length
            }
            )
          </button>
        ))}
      </div>
      <Table
        rows={search(
          rows.filter((r) => (mode === "submitted" ? r.report : !r.report)),
          query,
        )}
        columns={[
          {
            key: "full_name",
            title: "Child",
            render: (r) => (
              <Person name={r.full_name} sub={groupName(data, r.group_id)} />
            ),
          },
          {
            key: "caregiver_id",
            title: "Caregiver",
            render: (r) => userName(data, r.caregiver_id),
          },
          {
            key: "report",
            title: "Report",
            render: (r) => (
              <Badge
                value={r.report ? "submitted" : "pending"}
                tone={r.report ? "green" : "gold"}
              />
            ),
          },
          {
            key: "actions",
            title: "Details",
            render: (r) =>
              r.report ? (
                <Button
                  variant="quiet"
                  onClick={() => open("report-detail", r.report)}
                >
                  Read report
                </Button>
              ) : (
                <span className="p-kpi-note">Awaiting caregiver</span>
              ),
          },
        ]}
      />
    </Card>
  );
}
export function Monitoring(ctx: PageContext & { page: string }) {
  const { page, data, query, date, open } = ctx;
  if (page === "health")
    return (
      <Card>
        <div className="p-card-head">
          <div>
            <h2>Health & incident records</h2>
            <p>Factual observations and parent notification status</p>
          </div>
        </div>
        <Table
          rows={search(
            data.health.map((h) => ({
              ...h,
              child_name: childName(data, h.child_id),
            })),
            query,
          )}
          columns={[
            {
              key: "child_name",
              title: "Child",
              render: (r) => <Person name={r.child_name} />,
            },
            { key: "record_type", title: "Type" },
            {
              key: "severity",
              title: "Severity",
              render: (r) => <Badge value={r.severity} />,
            },
            {
              key: "parent_notified",
              title: "Parent informed",
              render: (r) => (
                <Badge value={r.parent_notified ? "complete" : "pending"} />
              ),
            },
            {
              key: "actions",
              title: "Record",
              render: (r) => (
                <Button
                  variant="quiet"
                  onClick={() => open("health-detail", r)}
                >
                  View details
                </Button>
              ),
            },
          ]}
        />
      </Card>
    );
  if (page === "biometric")
    return (
      <>
        <div className="p-notice">
          Enrollment and today's identity check are separate. Biometric device
          integration is pending; authorized staff can use the recorded manual
          pickup workflow.
        </div>
        <Card>
          <div className="p-card-head">
            <div><h2>Pickup contacts & requests</h2><p>Review new adults and manage pickup-only permission. App access is separate.</p></div>
            <Button onClick={()=>open("guardian-request-create")}>Add pickup contact</Button>
          </div>
          <Table rows={search((data.guardianRequests || []).map(g=>({...g,child_name:childName(data,g.child_id)})),query)} columns={[
            {key:"name",title:"Adult",render:r=><Person name={r.name} sub={r.relationship}/>},
            {key:"child_name",title:"Child"}, {key:"phone",title:"Phone"},
            {key:"status",title:"Decision",render:r=><Badge value={r.status}/>},
            {key:"review_note",title:"Review reason"},
            {key:"actions",title:"Review",render:r=>r.status==='pending'||r.status==='approved'?<Button variant="quiet" onClick={()=>open("guardian-request-review",r)}>{r.status==='pending'?'Review request':'Revoke permission'}</Button>:<span>Decision recorded</span>},
          ]}/>
        </Card>
        <Card>
          <div className="p-card-head">
            <h2>Guardian authorization & enrollment</h2>
          </div>
          <Table
            rows={search(
              data.guardians.map((g) => ({
                ...g,
                name: userName(data, g.user_id),
                child_name: childName(data, g.child_id),
              })),
              query,
            )}
            columns={[
              {
                key: "name",
                title: "Guardian",
                render: (r) => <Person name={r.name} sub={r.relationship} />,
              },
              { key: "child_name", title: "Child" },
              {
                key: "pickup_authorized",
                title: "Pickup permission",
                render: (r) => (
                  <Badge value={r.pickup_authorized ? "approved" : "pending"} />
                ),
              },
              {
                key: "enrolled",
                title: "Biometric record",
                render: (r) => (
                  <Badge value={r.enrolled ? "enrolled" : "not_enrolled"} />
                ),
              },
            ]}
          />
        </Card>
        <Card className="">
          <h2>Verification history</h2>
          <Table
            rows={search(
              data.verifications.map((v) => ({
                ...v,
                child_name: childName(data, v.child_id),
                name: v.guardian_name || userName(data, v.guardian_user_id),
              })),
              query,
            )}
            columns={[
              { key: "child_name", title: "Child" },
              { key: "name", title: "Adult guardian" },
              { key: "method", title: "Method" },
              {
                key: "result",
                title: "Result",
                render: (r) => <Badge value={r.result} />,
              },
              {
                key: "verified_at",
                title: "Time",
                render: (r) =>
                  localDay(r.verified_at) + " · " + localTime(r.verified_at),
              },
            ]}
          />
        </Card>
      </>
    );
  if (page === "events")
    return (
      <Card>
        <div className="p-card-head">
          <div>
            <h2>Moments to look forward to</h2>
            <p>Daycare events, meetings and closures</p>
          </div>
          <Button icon="plus" onClick={() => open("event")}>
            Create event
          </Button>
        </div>
        <Table
          rows={search(data.events, query)}
          columns={[
            { key: "title", title: "Event" },
            {
              key: "event_date",
              title: "Date",
              render: (r) => dayOf(r.event_date),
            },
            {
              key: "event_time",
              title: "Time",
              render: (r) => r.event_time?.slice(0, 5) || "All day",
            },
            { key: "event_type", title: "Type" },
            {
              key: "cancelled",
              title: "Status",
              render: (r) => (
                <Badge value={r.cancelled ? "cancelled" : "scheduled"} />
              ),
            },
            {
              key: "actions",
              title: "Manage",
              render: (r) => (
                <><Button variant="quiet" disabled={r.cancelled} onClick={() => open("event", r)}>Edit</Button>
                {!r.cancelled && <Button variant="quiet" onClick={()=>open("cancel-event",r)}>Cancel event</Button>}</>
              ),
            },
          ]}
        />
      </Card>
    );
  if (page === "communication")
    return (
      <>
        <Card>
          <div className="p-card-head">
            <div>
              <h2>Keep your community connected</h2>
              <p>Announcements for families and caregivers</p>
            </div>
            <Button icon="plus" onClick={() => open("announcement")}>
              New announcement
            </Button>
          </div>
          {search(data.announcements, query).map((a) => (
            <div key={a.id} className="p-attention">
              <span className="p-icon-tile">
                <Icon name="message" />
              </span>
              <div>
                <strong>{a.title}</strong>
                <p>{a.body}</p>
                <Badge
                  value={
                    a.audience === "group"
                      ? groupName(data, a.target_group_id)
                      : "All families & staff"
                  }
                />
              </div>
            </div>
          ))}
          {!data.announcements.length && <Empty />}
        </Card>
        <Card>
          <div className="p-card-head">
            <div>
              <h2>Your messages</h2>
              <p>Conversations sent to or from your account</p>
            </div>
            <Button icon="message" onClick={() => open("message")}>
              Write message
            </Button>
          </div>
          <Table
            rows={search(
              data.messages.map((m) => ({
                ...m,
                from: userName(data, m.sender_id),
              })),
              query,
            )}
            columns={[
              { key: "from", title: "From" },
              { key: "subject", title: "Subject" },
              {
                key: "read_at",
                title: "State",
                render: (r) => <Badge value={r.read_at ? "read" : "unread"} />,
              },
              {
                key: "actions",
                title: "Message",
                render: (r) => (
                  <Button
                    variant="quiet"
                    onClick={() => open("message-detail", r)}
                  >
                    Read
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      </>
    );
  if (page === "store")
    return (
      <Card>
        <div className="p-card-head">
          <div>
            <h2>Daycare essentials</h2>
            <p>Products, availability and stock</p>
          </div>
          <Button icon="plus" onClick={() => open("product")}>
            Add product
          </Button>
        </div>
        <Table
          rows={search(data.products, query)}
          columns={[
            {
              key: "name",
              title: "Product",
              render: (r) => (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      backgroundColor: "#F3F4F6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      border: "1px solid #E5E7EB",
                      flexShrink: 0,
                    }}
                  >
                    {r.image_url ? (
                      <img
                        src={r.image_url}
                        alt={r.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <span style={{ fontSize: 18 }}>🛍️</span>
                    )}
                  </div>
                  <div>
                    <strong style={{ color: "var(--navy)", display: "block" }}>{r.name}</strong>
                    {r.description && (
                      <small style={{ color: "var(--muted)", fontSize: 12 }}>
                        {r.description.length > 50 ? r.description.slice(0, 50) + "…" : r.description}
                      </small>
                    )}
                  </div>
                </div>
              ),
            },
            { key: "price", title: "Price", render: (r) => money(r.price) },
            {
              key: "stock_qty",
              title: "Stock",
              render: (r) => (
                <Badge
                  value={r.stock_qty + " in stock"}
                  tone={r.stock_qty <= 5 ? "gold" : "green"}
                />
              ),
            },
            {
              key: "available",
              title: "Availability",
              render: (r) => (
                <Badge value={r.available ? "available" : "unavailable"} />
              ),
            },
            {
              key: "actions",
              title: "Manage",
              render: (r) => (
                <Button variant="quiet" onClick={() => open("product", r)}>
                  Edit
                </Button>
              ),
            },
          ]}
        />
      </Card>
    );
  if (page === "orders")
    return (
      <Card>
        <div className="p-card-head">
          <div>
            <h2>Orders & payments</h2>
            <p>Fulfillment and payment are tracked separately.</p>
          </div>
        </div>
        <Table
          rows={search(
            data.orders.map((o) => ({
              ...o,
              name: userName(data, o.parent_id),
            })),
            query,
          )}
          columns={[
            { key: "id", title: "Order", render: (r) => "#ANK-" + r.id },
            { key: "note", title: "Parent note", render: (r) => r.note || "—" },
            {
              key: "name",
              title: "Parent",
              render: (r) => <Person name={r.name} />,
            },
            { key: "total", title: "Total", render: (r) => money(r.total) },
            {
              key: "order_status",
              title: "Fulfillment",
              render: (r) => <Badge value={r.order_status} />,
            },
            {
              key: "payment_status",
              title: "Payment",
              render: (r) => <div><Badge value={r.payment_status}/>{r.payment_method==='demo' && <small> DEMO · no money transferred<br/>{r.payment_reference}</small>}{r.payment_method==='no_charge' && <small> No charge</small>}</div>,
            },
            {
              key: "actions",
              title: "Manage",
              render: (r) => (
                <Button variant="quiet" onClick={() => open("order", r)}>
                  Update status
                </Button>
              ),
            },
          ]}
        />
      </Card>
    );
  if (page === "audit")
    return (
      <Card>
        <div className="p-card-head">
          <div>
            <h2>Accountability, in one place</h2>
            <p>Latest 200 recorded actions. Search by action or actor.</p>
          </div>
        </div>
        <Table
          rows={search(
            data.audit.map((a) => ({ ...a, name: a.actor_name || data.users.find(u=>u.id===a.actor_id)?.name || (a.actor_id ? `Account #${a.actor_id}` : 'System') })),
            query,
          )}
          columns={[
            {
              key: "created_at",
              title: "When",
              render: (r) =>
                localDay(r.created_at) + " · " + localTime(r.created_at),
            },
            { key: "name", title: "Actor" },
            {
              key: "action",
              title: "Action",
              render: (r) => label(r.action.toLowerCase()),
            },
            {
              key: "target_table",
              title: "Record",
              render: (r) =>
                label(r.target_table) + " #" + (r.target_id || "—"),
            },
          ]}
        />
      </Card>
    );
  if (page === "settings")
    return <DaycareSettings {...ctx} />;
  return (
    <Empty
      title="Page unavailable"
      text="Choose a section from the navigation."
    />
  );
}

export function DaycareSettings(ctx: PageContext) {
  const { data, open, actor } = ctx;
  const dc: Row = data.daycare || {
    id: 1,
    name: actor.daycare_name || "Ankelba Daycare Center",
    slug: "ankelba-main",
    license_number: "",
    contact_email: "contact@daycare.com",
    contact_phone: "",
    address: "Addis Ababa, Ethiopia",
    subscription_plan: actor.subscription_plan || "standard",
    trial_ends_at: actor.trial_ends_at,
    max_children: 50,
    status: "active",
  };
  const daysLeft = dc.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(dc.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const childCount = data.children?.length || 0;
  const maxCap = dc.max_children || 50;
  const capPct = Math.min(100, Math.round((childCount / maxCap) * 100));
  const staffCount = data.users?.filter((u) => ["admin", "caregiver"].includes(u.role)).length || 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>
      {/* Subscription & Quota Card */}
      <Card>
        <div className="p-card-head">
          <div>
            <h2>Subscription Plan & Enrollment Capacity</h2>
            <p>Your selected package and active enrollment capacity. Subscription terms and history are shown above.</p>
          </div>
          <Badge
            value={dc.subscription_plan}
            tone={dc.subscription_plan === "premium" ? "green" : "gold"}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20, margin: "16px 0" }}>
          <div style={{ background: "#fcfaf4", padding: "18px 20px", borderRadius: 14, border: "1px solid #eeece6" }}>
            <small style={{ color: "#76818B", fontWeight: 700, textTransform: "uppercase", fontSize: 11 }}>Active Plan</small>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#10263B", textTransform: "capitalize", margin: "4px 0" }}>
              {dc.subscription_plan} Care
            </div>
            <div style={{ fontSize: 13, color: daysLeft !== null && daysLeft <= 5 ? "#c0392b" : "#417B61", fontWeight: 600 }}>
              View current trial or paid-period status in your subscription details above.
            </div>
          </div>

          <div style={{ background: "#fcfaf4", padding: "18px 20px", borderRadius: 14, border: "1px solid #eeece6" }}>
            <small style={{ color: "#76818B", fontWeight: 700, textTransform: "uppercase", fontSize: 11 }}>Enrolled Children</small>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#10263B", margin: "4px 0" }}>
              {childCount} / {maxCap} ({capPct}%)
            </div>
            <div style={{ background: "#e8e5dc", borderRadius: 999, height: 6, width: "100%", overflow: "hidden", marginTop: 6 }}>
              <div style={{ background: capPct > 90 ? "#e07a5f" : "#417B61", height: "100%", width: `${capPct}%` }} />
            </div>
          </div>

          <div style={{ background: "#fcfaf4", padding: "18px 20px", borderRadius: 14, border: "1px solid #eeece6" }}>
            <small style={{ color: "#76818B", fontWeight: 700, textTransform: "uppercase", fontSize: 11 }}>Active Staff Team</small>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#10263B", margin: "4px 0" }}>
              {staffCount} Staff Accounts
            </div>
            <div style={{ fontSize: 13, color: "#76818B" }}>
              {data.groups?.length || 0} Classroom Groups
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 10 }}>
          <p>Contact platform support to request a subscription change.</p>
        </div>
      </Card>

      {/* Daycare Profile & Organization Card */}
      <Card>
        <div className="p-card-head">
          <div>
            <h2>Daycare Center Profile</h2>
            <p>Official registration and contact information for your center.</p>
          </div>
          <Button variant="secondary" icon="pencil" onClick={() => open("edit-settings", dc)}>
            Edit Center Profile
          </Button>
        </div>

        <div className="p-detail-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <div>
            <small>Center Legal Name</small>
            <p><strong>{dc.name}</strong></p>
          </div>
          <div>
            <small>Operating Slug / Tenant ID</small>
            <p><code>{dc.slug || "ankelba-main"}</code> (#{dc.id || 1})</p>
          </div>
          <div>
            <small>Official License Number</small>
            <p>{dc.license_number || "Pending Regulatory Verification"}</p>
          </div>
          <div>
            <small>Center Contact Email</small>
            <p>{dc.contact_email || "contact@daycare.com"}</p>
          </div>
          <div>
            <small>Contact Phone</small>
            <p>{dc.contact_phone || "Not configured"}</p>
          </div>
          <div>
            <small>Physical Address</small>
            <p>{dc.address || "Addis Ababa, Ethiopia"}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
