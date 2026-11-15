import React, { useEffect, useRef, useState } from "react";
import type { PageContext } from "./pages.web";
import { allowedAttendance, allowedPickup, attendanceStatus, dutyState, localTime, Row, today } from "./model";
import { Badge, Button, Card, Icon, Person } from "./ui.web";
import { PickupVerification } from "./PickupVerification.web";
import { apiError } from "./api";

type Props = PageContext & { mode: "arrivals" | "pickups"; onAction: (kind: string, row: Row, values: Record<string, any>) => Promise<void> };
export function DeskPage({ data, actor, staff, preview, open, mode, onAction }: Props) {
  const pickup = mode === "pickups";
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [scope, setScope] = useState("all");
  const [filter, setFilter] = useState("waiting");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const searchRef = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);
  const allowed = pickup ? allowedPickup : allowedAttendance;
  const eligible = data.children.filter(c => c.enrollment_status === "active" && allowed(data.duties, actor, c, now));
  const rows = eligible.map(c => ({ ...c, attendance: attendanceStatus(data, c.id, today()) }));
  const waiting = rows.filter(c => pickup ? c.attendance?.event_type === "checkin" : !c.attendance);
  const completed = rows.filter(c => pickup ? c.attendance?.event_type === "checkout" : ["checkin", "checkout"].includes(c.attendance?.event_type));
  const absent = rows.filter(c => c.attendance?.event_type === "absent");
  const source = filter === "waiting" ? waiting : filter === "completed" ? completed : absent;
  const visible = source.filter(c => (!group || String(c.group_id) === group) && (scope !== "mine" || c.caregiver_id === actor.id) && c.full_name.toLowerCase().includes(search.trim().toLowerCase()));
  const selected = waiting.find(c => c.id === selectedId);
  useEffect(() => { if (selectedId !== null && !selected) { setSelectedId(null); setVerificationBusy(false); } }, [selectedId, selected?.id]);
  const duties = data.duties.filter(d => d.staff_id === actor.id && d.daycare_id === actor.daycare_id && dutyState(d, now) === "on_duty" && d[pickup ? "can_pickup" : "can_attendance"]);
  const coverage = !staff ? "All children in your daycare" : duties.some(d => !d.group_id) ? "Front-desk coverage · All classrooms in your daycare" : duties.length ? `Front-desk coverage · ${duties.map(d => data.groups.find(g => g.id === d.group_id)?.name || "Assigned classroom").join(", ")}${pickup ? "" : " · Plus your assigned children"}` : pickup ? "An active pickup shift is required" : "Your assigned children";
  const close = () => { setSelectedId(null); setVerificationBusy(false); searchRef.current?.focus(); };
  const checkIn = async (child: Row) => {
    if (pending.current) return;
    pending.current = true; setBusyId(child.id); setError(""); setNotice("");
    try { await onAction("checkin", child, {}); setNotice(`${child.full_name} checked in.`); searchRef.current?.focus(); }
    catch (e) { setError(apiError(e)); }
    finally { pending.current = false; setBusyId(null); }
  };
  return <div className={`p-desk-page ${pickup ? "is-pickup" : "is-arrivals"}`}>
    <div className="p-desk-intro"><div><h2>{pickup ? "A safe handover, every time." : "A smooth start to their day."}</h2><p>{pickup ? "Select a child, verify the collecting adult, then confirm pickup." : "Find a child and record their arrival with one click."}</p></div><span className="p-desk-date">{now.toLocaleDateString("en", { timeZone: "Africa/Addis_Ababa", weekday: "short", month: "short", day: "numeric" })}</span></div>
    <div className="p-desk-coverage"><Icon name="desk" size={18} /><span>{coverage}</span>{duties.length > 0 && <small>Until {localTime(duties.map(d => d.ends_at).sort()[0])}</small>}</div>
    <div className="p-desk-counts" aria-label="Today’s totals"><span><strong>{waiting.length}</strong>{pickup ? "Awaiting pickup" : "Expected"}</span><span><strong>{completed.length}</strong>{pickup ? "Collected" : "Arrived"}</span>{!pickup && <span><strong>{absent.length}</strong>Absent</span>}</div>
    {notice && <div className="p-desk-notice" role="status"><Icon name="check" size={18} />{notice}</div>}
    {error && <div className="p-error" role="alert">{error}</div>}
    <div className={pickup ? "p-pickup-workspace" : ""}>
      <Card className="p-desk-roster">
        <div className="p-desk-roster-head"><h3>{pickup ? "Children at your desk" : "Today’s arrivals"}</h3><div className="p-desk-tabs" aria-label="Attendance view">
          <button aria-pressed={filter === "waiting"} disabled={verificationBusy} onClick={() => setFilter("waiting")}>{pickup ? "Awaiting pickup" : "Expected"}</button>
          <button aria-pressed={filter === "completed"} disabled={verificationBusy} onClick={() => setFilter("completed")}>{pickup ? "Collected" : "Arrived"}</button>
          {!pickup && <button aria-pressed={filter === "absent"} onClick={() => setFilter("absent")}>Absent</button>}
        </div></div>
        <div className="p-desk-filters"><label className="p-desk-search"><Icon name="search" size={18} /><input ref={searchRef} type="search" aria-label="Search children by name" placeholder="Search child’s name…" value={search} onChange={e => setSearch(e.target.value)} /></label>
          <select aria-label="Filter by classroom" value={group} onChange={e => setGroup(e.target.value)}><option value="">All classrooms</option>{data.groups.filter(g => eligible.some(c => c.group_id === g.id)).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          {staff && !pickup && duties.length > 0 && <select aria-label="Filter by assignment" value={scope} onChange={e => setScope(e.target.value)}><option value="all">All permitted children</option><option value="mine">My children</option></select>}
        </div>
        <div className="p-desk-list">
          {!visible.length && <div className="p-desk-empty"><Icon name={pickup ? "shield" : "check"} size={28} /><h3>{!eligible.length ? "No children available for this action" : search || group ? "No matching children" : filter === "waiting" ? pickup ? "No children awaiting pickup" : "No arrivals left to record" : "No records in this view"}</h3><p>{!eligible.length ? "Your current assignment and shift permissions determine which children appear here." : search || group ? "Try another name or classroom." : "The list updates as your team records attendance."}</p></div>}
          {visible.map(child => <div key={child.id} className={`p-desk-child-row ${selectedId === child.id ? "selected" : ""}`}>
            <Person name={child.full_name} sub={data.groups.find(g => g.id === child.group_id)?.name || "No classroom assigned"} />
            <div className="p-desk-row-actions">{filter === "waiting" ? pickup ? <Button variant={selectedId === child.id ? "" : "secondary"} disabled={verificationBusy} onClick={() => { setSelectedId(child.id); setError(""); setNotice(""); }}>{selectedId === child.id ? "Selected" : "Verify pickup"}</Button> : <><Button disabled={busyId !== null} onClick={() => void checkIn(child)}>{busyId === child.id ? "Checking in…" : "Check in"}</Button><Button variant="quiet" disabled={busyId !== null} onClick={() => open("absent", child)}>Absent</Button></> : <><Badge value={child.attendance?.event_type === "checkout" ? "Collected" : filter === "absent" ? "Absent" : "At daycare"} tone={filter === "absent" ? "neutral" : "green"} /><small>{localTime(child.attendance?.event_time)}</small></>}</div>
          </div>)}
        </div>
      </Card>
      {pickup && <Card className="p-pickup-panel"><div className="p-pickup-panel-head"><span className="p-desk-eyebrow">PICKUP VERIFICATION</span><h3>{selected ? "Confirm the collecting adult" : "Ready for the next pickup"}</h3></div>{selected ? <PickupVerification key={selected.id} row={selected} data={data} preview={preview} onBusyChange={setVerificationBusy} onClose={close} onSave={async values => { await onAction("pickup", selected, values); setNotice(`${selected.full_name} picked up successfully.`); close(); }} /> : <div className="p-desk-empty"><Icon name="shield" size={32} /><h3>Select a child to begin</h3><p>The approved adult and verification details will appear here.</p><div className="p-pickup-steps"><span>1. Select child</span><span>2. Verify adult</span><span>3. Confirm pickup</span></div></div>}</Card>}
    </div>
  </div>;
}
