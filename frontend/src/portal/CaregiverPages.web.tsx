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
  const [child, setChild] = useState("");
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
              <label>
                Child
                <select
                  name="child_id"
                  required
                  value={child}
                  onChange={(e) => {
                    setChild(e.target.value);
                    setDetail(null);
                  }}
                >
                  <option value="">Choose an assigned child</option>
                  {assigned.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </label>
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
            disabled={busy || !assigned.length}
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
                  {assigned.find((c) => c.id === r.child_id)?.full_name} ·{" "}
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
