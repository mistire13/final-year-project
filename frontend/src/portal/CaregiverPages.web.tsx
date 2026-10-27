import React, { useEffect, useState } from "react";
import { PageContext } from "./pages.web";
import { Card, Button, Empty } from "./ui.web";
import { portalClient, apiError } from "./api";
import { PageTransition } from "./WebMotion.web";
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
  const [contacts, setContacts] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>(ctx.data.messages);
  const [detail, setDetail] = useState<any>(null);
  useEffect(() => {
    setMessage("");
    setDetail(null);
    if (page === "communication")
      portalClient
        .get("/communication/contacts")
        .then((r) => setContacts(r.data.contacts || []))
        .catch(() =>
          setMessage(
            "Contacts could not be loaded. Reopen this page to retry.",
          ),
        );
  }, [page]);
  const send = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    setMessage("");
    try {
      if (page === "communication") {
        const { data } = await portalClient.post("/communication/messages", {
          recipient_id: Number(values.recipient),
          subject: values.subject,
          body: values.body,
        });
        setMessages((prev) => [data, ...prev]);
        form.reset();
        setMessage("Message sent.");
      } else {
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
        setMessage("Record saved.");
      }
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
  return (
    <>
      <Card
        title={
          page === "reports"
            ? "Write a daily report"
            : page === "health"
              ? "Health & incident reporting"
              : "Family communication"
        }
      >
        <p className="p-kpi-note">
          {page === "communication"
            ? "Choose a daycare contact to start a conversation."
            : "Only children assigned to your care can receive new reports and health records."}
        </p>
        <form onSubmit={send} className="care-form">
          {page === "communication" ? (
            <>
              <label>
                Recipient
                <select name="recipient" required defaultValue="">
                  <option value="" disabled>
                    Choose a contact
                  </option>
                  {contacts.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name} · {c.role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Subject
                <input name="subject" maxLength={200} />
              </label>
              <label>
                Message
                <textarea name="body" required maxLength={10000} />
              </label>
            </>
          ) : (
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
          )}
          {!!message && (
            <p role="status" className="care-wide p-notice">
              {message}
            </p>
          )}
          <Button
            type="submit"
            disabled={busy || (page !== "communication" && !assigned.length)}
          >
            {busy
              ? "Saving…"
              : page === "communication"
                ? "Send message"
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
      {page === "communication" ? (
        <>
          <Card title="Your messages">
            {messages.length ? (
              messages.map((m) => (
                <article className="care-history" key={m.id}>
                  <strong>{m.subject || "Message"}</strong>
                  <p>{m.body}</p>
                  <small>{new Date(m.created_at).toLocaleString()}</small>
                  {m.recipient_id === ctx.actor.id && !m.read_at && (
                    <Button
                      variant="quiet"
                      onClick={async () => {
                        try {
                          await portalClient.patch(
                            `/communication/messages/${m.id}/read`,
                          );
                          setMessages((rows) =>
                            rows.map((r) =>
                              r.id === m.id
                                ? { ...r, read_at: new Date().toISOString() }
                                : r,
                            ),
                          );
                        } catch (e) {
                          setMessage(apiError(e));
                        }
                      }}
                    >
                      Mark read
                    </Button>
                  )}
                </article>
              ))
            ) : (
              <p>No conversations yet.</p>
            )}
          </Card>
          <Card title="Announcements">
            {ctx.data.announcements.map((a) => (
              <article className="care-history" key={a.id}>
                <h3>{a.title}</h3>
                <p>{a.body}</p>
              </article>
            ))}
          </Card>
        </>
      ) : (
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
      )}
    </>
  );
}
