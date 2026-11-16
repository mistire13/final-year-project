import React, { useEffect, useState } from "react";
import { PageContext } from "./pages.web";
import { Card, Button, Empty } from "./ui.web";
import { portalClient, apiError } from "./api";
import CommunicationWorkspace from "./CommunicationWorkspace.web";
export function CaregiverPage({
  ctx,
  page,
}: {
  ctx: PageContext;
  page: string;
}) {
  const [reports, setReports] = useState<any[]>(ctx.data.reports);
  const [health, setHealth] = useState<any[]>(ctx.data.health);
  const assigned = ctx.data.children.filter(
    (c) => c.caregiver_id === ctx.actor.id,
  );
  const availableChildren =
    assigned.length > 0
      ? assigned
      : ctx.data.children.filter((c) => c.enrollment_status === "active");
  const [child, setChild] = useState("");
  const [childSearch, setChildSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<any>(null);
  useEffect(() => { setReports(ctx.data.reports); }, [ctx.data.reports]);
  useEffect(() => { setHealth(ctx.data.health); }, [ctx.data.health]);
  const send = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    setMessage("");
    try {
      const child_id = Number(values.child_id);
      const body =
        page === "reports"
            ? {
                child_id,
                report_date: values.date,
                mood: values.mood,
                sleep_duration_min: values.sleep ? Number(values.sleep) : null,
                general_observations: values.notes,
                meals: values.meal
                  ? [{ meal_type: values.meal_type, description: values.meal }]
                  : [],
                activities: values.activity
                  ? [
                      {
                        activity_type: values.activity_type,
                        description: values.activity,
                      },
                    ]
                  : [],
              }
            : {
                child_id,
                record_type: values.type,
                severity: values.severity,
                description: values.notes,
              };
      const { data } = await portalClient.post(
        page === "reports" ? "/reports/daily" : "/health",
        body,
      );
      setDetail(data);
      (page === "reports" ? setReports : setHealth)((rows) => [
        data,
        ...rows.filter((r) => r.id !== data.id),
      ]);
      form.reset();
      setMessage("Record saved.");
    } catch (error) {
      setMessage(apiError(error));
    } finally {
      setBusy(false);
    }
  };
  if (page === "events")
    return (
      <>
        {ctx.data.events.length ? (
          ctx.data.events.map((e) => (
            <Card key={e.id} title={e.title}>
              <p>
                {e.event_date} · {e.event_time || ""}
              </p>
              <p>{e.description}</p>
            </Card>
          ))
        ) : (
          <Empty
            title="No upcoming events"
            text="Your daycare team’s upcoming events will appear here."
          />
        )}
      </>
    );
  if (page === "communication") return <CommunicationWorkspace ctx={ctx} />;
  return (
    <>
      <Card
        title={
          page === "reports"
            ? "Write a daily report"
            : page === "health"
              ? "Health & incident reporting"
              : "Health & incident reporting"
        }
      >
        <p className="p-kpi-note">
          Only children assigned to your care can receive new reports and health records.
        </p>
        <form onSubmit={send} className="care-form">
          <>
              <div className="care-wide" style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <label htmlFor="caregiver-child-search" style={{ fontWeight: 600, color: "var(--navy)", margin: 0 }}>
                    Select Student <span style={{ color: "#e11d48" }}>*</span>
                  </label>
                  {child && (
                    <button
                      type="button"
                      onClick={() => {
                        setChild("");
                        setDetail(null);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#4f46e5",
                        fontSize: 12,
                        cursor: "pointer",
                        textDecoration: "underline",
                        padding: 0,
                      }}
                    >
                      Clear selection
                    </button>
                  )}
                </div>

                {/* Hidden input preserves form submission semantics */}
                <input type="hidden" name="child_id" value={child} required />

                {/* Search input field */}
                <div style={{ position: "relative", marginBottom: 8 }}>
                  <input
                    id="caregiver-child-search"
                    type="search"
                    placeholder="Search students by name or classroom..."
                    value={childSearch}
                    onChange={(e) => setChildSearch(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #cbd5e1",
                      fontSize: 14,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Scrollable list of students */}
                <div
                  role="listbox"
                  aria-label="Select student"
                  style={{
                    maxHeight: 200,
                    overflowY: "auto",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    background: "#f8fafc",
                    padding: 6,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {availableChildren
                    .filter((c) => {
                      if (!childSearch.trim()) return true;
                      const q = childSearch.trim().toLowerCase();
                      const group = ctx.data.groups.find((g) => g.id === c.group_id);
                      return (
                        c.full_name.toLowerCase().includes(q) ||
                        (group?.name && group.name.toLowerCase().includes(q))
                      );
                    })
                    .map((c) => {
                      const isSelected = child === String(c.id);
                      const group = ctx.data.groups.find((g) => g.id === c.group_id);
                      const initials = (c.full_name || "?")
                        .split(" ")
                        .map((n: string) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase();
                      return (
                        <div
                          key={c.id}
                          role="option"
                          aria-selected={isSelected}
                          tabIndex={0}
                          onClick={() => {
                            setChild(isSelected ? "" : String(c.id));
                            setDetail(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setChild(isSelected ? "" : String(c.id));
                              setDetail(null);
                            }
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 12px",
                            borderRadius: 6,
                            cursor: "pointer",
                            background: isSelected ? "#eef2ff" : "#ffffff",
                            border: isSelected ? "1.5px solid #4f46e5" : "1px solid #e2e8f0",
                            transition: "all 0.15s ease",
                            userSelect: "none",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 16,
                                background: isSelected ? "#4f46e5" : "#e2e8f0",
                                color: isSelected ? "#ffffff" : "#334155",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 12,
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {initials}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontWeight: isSelected ? 700 : 600,
                                  fontSize: 14,
                                  color: isSelected ? "#1e1b4b" : "#0f172a",
                                }}
                              >
                                {c.full_name}
                              </div>
                              <div style={{ fontSize: 12, color: "#64748b" }}>
                                {group?.name || "Classroom"} {c.date_of_birth ? `· ${c.date_of_birth}` : ""}
                              </div>
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "3px 8px",
                              borderRadius: 12,
                              background: isSelected ? "#4f46e5" : "#f1f5f9",
                              color: isSelected ? "#ffffff" : "#475569",
                              flexShrink: 0,
                            }}
                          >
                            {isSelected ? "✓ Selected" : "Select"}
                          </span>
                        </div>
                      );
                    })}
                  {availableChildren.filter((c) => {
                    if (!childSearch.trim()) return true;
                    const q = childSearch.trim().toLowerCase();
                    const group = ctx.data.groups.find((g) => g.id === c.group_id);
                    return (
                      c.full_name.toLowerCase().includes(q) ||
                      (group?.name && group.name.toLowerCase().includes(q))
                    );
                  }).length === 0 && (
                    <div style={{ padding: "16px 12px", textAlign: "center", color: "#64748b", fontSize: 13 }}>
                      {childSearch.trim()
                        ? `No students matching "${childSearch.trim()}"`
                        : "No students available."}
                    </div>
                  )}
                </div>
                {!child && (
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>
                    Select a student from the list above to record care.
                  </p>
                )}
              </div>
              {page === "reports" ? (
                <>
                  <label>
                    Report date
                    <input
                      name="date"
                      type="date"
                      required
                      defaultValue={ctx.date}
                    />
                  </label>
                  <label>
                    Mood
                    <select name="mood">
                      {["happy", "calm", "fussy", "tired", "excited"].map(
                        (v) => (
                          <option key={v}>{v}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    Rest (minutes)
                    <input name="sleep" type="number" min="0" max="1440" />
                  </label>
                  <label>
                    Meal type
                    <select name="meal_type">
                      {[
                        "breakfast",
                        "morning_snack",
                        "lunch",
                        "afternoon_snack",
                        "dinner",
                      ].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Meal description
                    <input name="meal" maxLength={1000} />
                  </label>
                  <label>
                    Activity type
                    <select name="activity_type">
                      <option>learning</option>
                      <option>play</option>
                    </select>
                  </label>
                  <label>
                    Activity description
                    <input name="activity" maxLength={1000} />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Record type
                    <select name="type">
                      <option value="health">Health observation</option>
                      <option value="incident">Incident</option>
                    </select>
                  </label>
                  <label>
                    Severity
                    <select name="severity">
                      <option>low</option>
                      <option>moderate</option>
                      <option>high</option>
                    </select>
                  </label>
                </>
              )}
              <label className="care-wide">
                {page === "health"
                  ? "Observation / incident description"
                  : "Care notes"}
                <textarea
                  name="notes"
                  required={page === "health"}
                  maxLength={10000}
                />
              </label>
          </>
          {!!message && (
            <p role="status" className="care-wide p-notice">
              {message}
            </p>
          )}
          <Button
            type="submit"
            disabled={busy || !child}
          >
            {busy
              ? "Saving…"
              : "Save record"}
          </Button>
        </form>
        {page === "health" && detail?.id && (
          <Button
            onClick={async () => {
              try {
                await portalClient.patch(`/health/${detail.id}/notify`);
                setMessage("Parent notification recorded.");
              } catch (e) {
                setMessage(apiError(e));
              }
            }}
          >
            Notify parent in the app
          </Button>
        )}
      </Card>
      <Card
          title={
            page === "reports" ? "Report history" : "Health record history"
          }
        >
          {(page === "reports" ? reports : health)
            .filter((r) => !child || r.child_id === Number(child))
            .map((r) => (
              <article key={r.id} className="care-history">
                <strong>
                  {availableChildren.find((c) => c.id === r.child_id)?.full_name ||
                    ctx.data.children.find((c) => c.id === r.child_id)?.full_name ||
                    `Child #${r.child_id}`} ·{" "}
                  {r.report_date ||
                    new Date(r.recorded_at).toLocaleDateString()}
                </strong>
                <p>{r.general_observations || r.description || r.mood}</p>
                {page === "reports" && (
                  <Button
                    variant="quiet"
                    onClick={async () => {
                      try {
                        setDetail(
                          (await portalClient.get(`/reports/daily/${r.id}`))
                            .data,
                        );
                      } catch (e) {
                        setMessage(apiError(e));
                      }
                    }}
                  >
                    Read report
                  </Button>
                )}
                {page === "health" && !r.parent_notified && (
                  <Button
                    variant="quiet"
                    onClick={async () => {
                      try {
                        await portalClient.patch(`/health/${r.id}/notify`);
                        setMessage("Parent notification recorded.");
                      } catch (e) {
                        setMessage(apiError(e));
                      }
                    }}
                  >
                    Notify parent
                  </Button>
                )}
              </article>
            ))}
          {detail && page === "reports" && (
            <div className="p-notice">
              <h3>Report details</h3>
              <p>{detail.general_observations}</p>
              <p>
                Mood: {detail.mood} · Rest: {detail.sleep_duration_min ?? "—"}{" "}
                minutes
              </p>
              {detail.meals?.map((m: any) => (
                <p key={m.id}>
                  {m.meal_type}: {m.description}
                </p>
              ))}
              {detail.activities?.map((a: any) => (
                <p key={a.id}>
                  {a.activity_type}: {a.description}
                </p>
              ))}
            </div>
          )}
      </Card>
    </>
  );
}
