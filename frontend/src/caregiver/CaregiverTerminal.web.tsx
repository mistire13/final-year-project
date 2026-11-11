import React, { useEffect, useState, useMemo } from "react";
import "../portal/portal.css";
import "./caregiver.css";
import { Button, Icon } from "../portal/ui.web";
import { portalClient, portalApi, apiError, portalTokenStorage } from "../portal/api";
import { Dataset, emptyDataset, today, localTime, localDay } from "../portal/model";

interface GuardianOption {
  key: string;
  name: string;
  relationship: string;
  phone?: string;
  userId?: number;
  pickupId?: number;
  authorized: boolean;
}

interface ChildCardData {
  id: number;
  full_name: string;
  photo_url?: string;
  group_id?: number;
  group_name: string;
  caregiver_name?: string;
  status: "not_arrived" | "present" | "checked_out" | "absent";
  checkin_time?: string;
  checkout_time?: string;
  collector_name?: string;
  allergies?: string;
  guardians: GuardianOption[];
}

export default function CaregiverTerminal() {
  const [actor, setActor] = useState<any | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [data, setData] = useState<Dataset>(emptyDataset());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Filters & Search
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "not_arrived" | "present" | "checked_out" | "absent">("all");
  const [groupFilter, setGroupFilter] = useState<string>("");

  // Clock
  const [currentTime, setCurrentTime] = useState(
    new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Africa/Addis_Ababa" })
  );

  // Verified Pickup Modal State
  const [selectedChildForPickup, setSelectedChildForPickup] = useState<ChildCardData | null>(null);
  const [selectedGuardianKey, setSelectedGuardianKey] = useState<string>("");
  const [verifiedIdentityChecked, setVerifiedIdentityChecked] = useState(false);
  const [verificationReason, setVerificationReason] = useState(
    "Visual photo ID checked and verified against authorized guardian record at front desk"
  );

  // Live Clock effect
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Africa/Addis_Ababa" })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Check auth session
  useEffect(() => {
    async function initSession() {
      try {
        const user = await portalApi.session();
        if (user && (user.role === "caregiver" || user.role === "admin")) {
          setActor(user);
        } else {
          setActor(null);
        }
      } catch {
        setActor(null);
      } finally {
        setAuthChecking(false);
      }
    }
    void initSession();
  }, []);

  // Fetch live workspace data once authenticated
  const fetchWorkspace = async () => {
    if (!actor) return;
    setLoading(true);
    setError(null);
    try {
      const snap = await portalApi.snapshot(today(), actor.role === "caregiver");
      setData(snap);
    } catch (err: any) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (actor) {
      void fetchWorkspace();
    }
  }, [actor]);

  // Front-Desk Staff Sign-In
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError("");
    try {
      const user = await portalApi.login(loginEmail.trim(), loginPassword);
      if (user.role !== "caregiver" && user.role !== "admin") {
        setLoginError("Staff or Daycare Admin access required for Front-Desk Terminal.");
        return;
      }
      setActor(user);
    } catch (err: any) {
      setLoginError(apiError(err));
    } finally {
      setLoginBusy(false);
    }
  };

  const handleSignOut = async () => {
    await portalApi.logout().catch(() => {});
    setActor(null);
    setData(emptyDataset());
  };

  // Convert raw dataset to typed ChildCardData
  const roster: ChildCardData[] = useMemo(() => {
    const todayDate = today();
    const groupMap = new Map<number, string>();
    (data.groups || []).forEach((g) => groupMap.set(g.id, g.name));

    const userMap = new Map<number, any>();
    (data.users || []).forEach((u) => userMap.set(u.id, u));

    return (data.children || [])
      .filter((c) => c.enrollment_status === "active")
      .map((child) => {
        // Today's attendance events
        const todayEvents = (data.attendance || [])
          .filter((a) => a.child_id === child.id && localDay(a.event_time) === todayDate)
          .sort((a, b) => Date.parse(b.event_time) - Date.parse(a.event_time) || b.id - a.id);

        const latestEvent = todayEvents[0];
        let status: "not_arrived" | "present" | "checked_out" | "absent" = "not_arrived";
        let checkin_time: string | undefined;
        let checkout_time: string | undefined;

        if (latestEvent) {
          if (latestEvent.event_type === "checkin") {
            status = "present";
            checkin_time = localTime(latestEvent.event_time);
          } else if (latestEvent.event_type === "checkout") {
            status = "checked_out";
            checkout_time = localTime(latestEvent.event_time);
            // Check earlier check-in
            const checkinEvent = todayEvents.find((e) => e.event_type === "checkin");
            if (checkinEvent) checkin_time = localTime(checkinEvent.event_time);
          } else if (latestEvent.event_type === "absent") {
            status = "absent";
          }
        }

        // Verification collector name if checked out
        const lastVerification = (data.verifications || [])
          .filter((v) => v.child_id === child.id && localDay(v.verified_at) === todayDate)
          .sort((a, b) => Date.parse(b.verified_at) - Date.parse(a.verified_at))[0];

        // Gather authorized guardians
        const guardiansList: GuardianOption[] = [];

        // 1. Parent guardians
        (data.guardians || [])
          .filter((g) => g.child_id === child.id && g.pickup_authorized)
          .forEach((g) => {
            const u = userMap.get(g.user_id);
            guardiansList.push({
              key: `user:${g.user_id}`,
              name: u ? u.name : child.parent_name || `Parent ID ${g.user_id}`,
              relationship: g.relationship || "Parent",
              phone: u?.phone || child.parent_phone,
              userId: g.user_id,
              authorized: true,
            });
          });

        // 2. Approved third-party pickup guardians
        (data.guardianRequests || [])
          .filter((gr) => gr.child_id === child.id && gr.status === "approved")
          .forEach((gr) => {
            guardiansList.push({
              key: `pickup:${gr.id}`,
              name: gr.name,
              relationship: gr.relationship || "Authorized Guardian",
              phone: gr.phone,
              pickupId: gr.id,
              authorized: true,
            });
          });

        const caregiverObj = child.caregiver_id ? userMap.get(child.caregiver_id) : null;
        const allergies = (child.care_instructions || [])
          .filter((ci: any) => ci.category === "allergy")
          .map((ci: any) => ci.instruction_text)
          .join(", ");

        return {
          id: child.id,
          full_name: child.full_name,
          photo_url: child.photo_url,
          group_id: child.group_id,
          group_name: groupMap.get(child.group_id) || "General Group",
          caregiver_name: caregiverObj ? caregiverObj.name : "Unassigned",
          status,
          checkin_time,
          checkout_time,
          collector_name: lastVerification?.guardian_name,
          allergies: allergies || undefined,
          guardians: guardiansList,
        };
      });
  }, [data]);

  // Attendance Check-In Action
  const handleCheckIn = async (childId: number) => {
    setActionBusy(true);
    setFeedback(null);
    try {
      await portalClient.post("/portal/attendance", {
        child_id: childId,
        event_type: "checkin",
        notes: "Front-desk arrival check-in",
      });
      setFeedback({ text: "✓ Morning check-in recorded successfully!", type: "success" });
      await fetchWorkspace();
    } catch (err: any) {
      setFeedback({ text: apiError(err), type: "error" });
    } finally {
      setActionBusy(false);
    }
  };

  // Mark Child Absent Action
  const handleMarkAbsent = async (childId: number) => {
    if (!window.confirm("Mark this child as absent for today?")) return;
    setActionBusy(true);
    setFeedback(null);
    try {
      await portalClient.post("/portal/attendance", {
        child_id: childId,
        event_type: "absent",
        notes: "Marked absent at front desk",
      });
      setFeedback({ text: "Child marked absent for today.", type: "success" });
      await fetchWorkspace();
    } catch (err: any) {
      setFeedback({ text: apiError(err), type: "error" });
    } finally {
      setActionBusy(false);
    }
  };

  // Open Pickup Dialog
  const openPickupModal = (child: ChildCardData) => {
    setSelectedChildForPickup(child);
    setSelectedGuardianKey(child.guardians[0]?.key || "");
    setVerifiedIdentityChecked(false);
    setVerificationReason(
      "Visual photo ID checked and verified against authorized guardian record at front desk"
    );
  };

  // Verified Pickup & Release Action
  const handleCompletePickup = async () => {
    if (!selectedChildForPickup || !selectedGuardianKey || !verifiedIdentityChecked) return;
    if (verificationReason.trim().length < 12) {
      alert("Verification reason must be at least 12 characters explaining the ID inspection.");
      return;
    }

    const selectedGuardian = selectedChildForPickup.guardians.find((g) => g.key === selectedGuardianKey);
    if (!selectedGuardian) {
      alert("Please select an authorized adult collector.");
      return;
    }

    setActionBusy(true);
    setFeedback(null);
    try {
      await portalClient.post("/portal/checkout", {
        child_id: selectedChildForPickup.id,
        ...(selectedGuardian.userId ? { guardian_user_id: selectedGuardian.userId } : { pickup_guardian_id: selectedGuardian.pickupId }),
        method: "manual",
        identity_confirmed: true,
        reason: verificationReason.trim(),
      });
      setFeedback({
        text: `✓ Child safely released to authorized guardian (${selectedGuardian.name})!`,
        type: "success",
      });
      setSelectedChildForPickup(null);
      await fetchWorkspace();
    } catch (err: any) {
      alert(apiError(err));
    } finally {
      setActionBusy(false);
    }
  };

  // Filtered Roster
  const filteredChildren = roster.filter((c) => {
    const matchesSearch = c.full_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    const matchesGroup = !groupFilter || String(c.group_id) === groupFilter;
    return matchesSearch && matchesStatus && matchesGroup;
  });

  const presentCount = roster.filter((c) => c.status === "present").length;
  const notArrivedCount = roster.filter((c) => c.status === "not_arrived").length;
  const checkedOutCount = roster.filter((c) => c.status === "checked_out").length;
  const absentCount = roster.filter((c) => c.status === "absent").length;

  if (authChecking) {
    return (
      <div className="ankelba-portal caregiver-terminal-container" style={{ alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--muted)", fontSize: "1.1rem", fontWeight: 600 }}>Connecting to Front-Desk Terminal...</p>
      </div>
    );
  }

  // Staff authentication shares the daycare portal design and session boundary.
  if (!actor) {
    return (
      <div className="ankelba-portal p-login caregiver-login">
        <div className="terminal-login-backdrop" aria-hidden="true">
          <div className="terminal-hero-orbit terminal-hero-orbit-one" />
          <div className="terminal-hero-orbit terminal-hero-orbit-two" />
          <div className="terminal-hero-grid" />
        </div>
        <section className="p-login-story">
          <a href="/" className="terminal-brand"><img src={require("../../design/figma-exports/ankelba-symbol.png")} alt="" /><span>Ankelba<small>DAYCARE WORKSPACE</small></span></a>
          <h1>Attendance and pickup</h1>
        </section>
        <section className="p-login-card"><div>
          <div className="terminal-login-heading-icon"><Icon name="desk" size={26} /></div>
          <h1>Front desk sign in</h1>
          <p className="terminal-login-description">Sign in with your caregiver or daycare administrator account.</p>
          <form onSubmit={handleLogin}>
            <label htmlFor="terminal-email">Email address<input id="terminal-email" name="email" type="email" autoComplete="username" placeholder="you@daycare.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required /></label>
            <label htmlFor="terminal-password">Password<div className="terminal-password-field"><input id="terminal-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Your password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}><Icon name="eye" size={18} /></button></div></label>
            {loginError && <div role="alert" className="p-error">{loginError}</div>}
            <Button type="submit" disabled={loginBusy}>{loginBusy ? "Signing in…" : "Sign in to front desk"}<Icon name="arrow" size={18} /></Button>
          </form>
          <p className="terminal-access-note"><Icon name="lock" size={16} />Need access? Contact your daycare administrator.</p>
          <footer><a href="/">Back to Ankelba</a><a href="/admin/login">Daycare admin portal</a></footer>
        </div></section>
      </div>
    );
  }

  return (
    <div className="ankelba-portal caregiver-terminal-container">
      <header className="terminal-header">
        <a className="terminal-workspace-brand" href="/"><img src={require("../../design/figma-exports/ankelba-symbol.png")} alt="" /><span>Ankelba<small>{data.daycare?.name || actor.daycare_name || "Daycare workspace"}</small></span></a>
        <div className="terminal-workspace-actions">
          <span className="terminal-staff-profile"><span className="terminal-staff-avatar">{String(actor.name || "Staff").split(" ").map((part: string) => part[0]).slice(0, 2).join("")}</span><span>{actor.name}<small>{actor.role === "admin" ? "Daycare administrator" : "Caregiver"}</small></span></span>
          {actor.role === "admin" && <a className="terminal-admin-link" href="/admin/dashboard"><Icon name="building" size={16} />Admin portal</a>}
          <Button variant="secondary" onClick={handleSignOut} icon="logout">Sign out</Button>
        </div>
      </header>
      <section className="terminal-workspace-intro">
        <h1>Front desk</h1>
        <div className="terminal-shift-panel"><Icon name="clock" size={20} /><div><strong>{currentTime}</strong><small>{new Date().toLocaleDateString("en-US", { timeZone: "Africa/Addis_Ababa", weekday: "short", month: "short", day: "numeric" })} · Addis Ababa</small></div><Button variant="secondary" onClick={fetchWorkspace} disabled={loading} icon="refresh">{loading ? "Refreshing…" : "Refresh"}</Button></div>
      </section>
      <section className="terminal-stats-bar" aria-label="Today's attendance overview">
        {[
          { label: "At daycare", count: presentCount, icon: "people", tone: "green" },
          { label: "Expected arrivals", count: notArrivedCount, icon: "clock", tone: "amber" },
          { label: "Picked up", count: checkedOutCount, icon: "shield", tone: "sky" },
          { label: "Absent", count: absentCount, icon: "calendar", tone: "neutral" },
        ].map(stat => <div className="terminal-metric" key={stat.label}><div className="terminal-metric-top"><span>{stat.label}</span><span className={"terminal-metric-icon " + stat.tone}><Icon name={stat.icon} size={19} /></span></div><strong>{loading ? "—" : stat.count}</strong></div>)}
      </section>

      {/* ─── Feedback Banner ─── */}
      {feedback && (
        <div role={feedback.type === "error" ? "alert" : "status"}
          style={{
            maxWidth: 1300,
            margin: "1rem auto 0",
            width: "calc(100% - 5rem)",
            padding: "0.85rem 1.25rem",
            borderRadius: "14px",
            background: feedback.type === "success" ? "var(--green-soft)" : "var(--coral-soft)",
            color: feedback.type === "success" ? "var(--green)" : "var(--navy)",
            fontWeight: 700,
            fontSize: "0.95rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{feedback.text}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setFeedback(null)}
            style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 800, fontSize: "1rem" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ─── Main Content Container ─── */}
      <main className="terminal-content">
        <div className="terminal-section-heading"><div><span className="p-eyebrow">DAILY OPERATIONS</span><h2>Attendance &amp; pickup</h2><p>Manage arrivals and verify every handover.</p></div><span className="terminal-roster-count">{filteredChildren.length} of {roster.length} children</span></div>
        {/* Controls: Search, Classroom Group Filter & Status Tabs */}
        <div className="terminal-roster-toolbar">
          {/* Status Tabs */}
          <div className="terminal-filter-tabs" role="group" aria-label="Filter children by attendance">
            <button
              className={`terminal-filter-tab ${statusFilter === "all" ? "active" : ""}`}
              aria-pressed={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
            >
              All Children ({roster.length})
            </button>
            <button
              className={`terminal-filter-tab ${statusFilter === "not_arrived" ? "active" : ""}`}
              aria-pressed={statusFilter === "not_arrived"}
              onClick={() => setStatusFilter("not_arrived")}
            >
              Expected Today ({notArrivedCount})
            </button>
            <button
              className={`terminal-filter-tab ${statusFilter === "present" ? "active" : ""}`}
              aria-pressed={statusFilter === "present"}
              onClick={() => setStatusFilter("present")}
            >
              At Daycare ({presentCount})
            </button>
            <button
              className={`terminal-filter-tab ${statusFilter === "checked_out" ? "active" : ""}`}
              aria-pressed={statusFilter === "checked_out"}
              onClick={() => setStatusFilter("checked_out")}
            >
              Picked Up ({checkedOutCount})
            </button>
          </div>

          {/* Search & Group Filter */}
          <div className="terminal-roster-search">
            <select
              aria-label="Classroom group"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              style={{
                padding: "0.6rem 1rem",
                borderRadius: "9999px",
                border: "1.5px solid var(--line)",
                fontFamily: "inherit",
                fontSize: "0.85rem",
                background: "var(--cream-card)",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              <option value="">All Classroom Groups</option>
              {(data.groups || []).map((g) => (
                <option key={g.id} value={String(g.id)}>
                  {g.name}
                </option>
              ))}
            </select>

            <input
              type="search"
              aria-label="Search children" placeholder="Search children by name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: "0.6rem 1rem",
                borderRadius: "9999px",
                border: "1.5px solid var(--line)",
                fontFamily: "inherit",
                fontSize: "0.88rem",
                width: "220px",
              }}
            />
          </div>
        </div>

        {/* Child Roster Grid */}
        {loading ? (
          <p style={{ textAlign: "center", color: "var(--muted)", margin: "4rem 0", fontSize: "1.05rem" }}>
            Loading children roster & live attendance...
          </p>
        ) : error ? (
          <div style={{ textAlign: "center", margin: "4rem 0" }}>
            <p style={{ color: "var(--navy)", fontWeight: 700, fontSize: "1.05rem" }}>{error}</p>
            <button onClick={fetchWorkspace} className="btn-secondary-pill" style={{ marginTop: "1rem" }}>
              Try Reconnecting
            </button>
          </div>
        ) : filteredChildren.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--muted)", margin: "4rem 0", padding: "3rem", background: "var(--cream-card)", borderRadius: "20px", border: "1px solid var(--line)" }}>
            <Icon name="search" size={28} />
            <p style={{ fontWeight: 700, fontSize: "1.1rem", margin: 0 }}>No children found matching the filter.</p>
            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setGroupFilter("");
              }}
              className="btn-secondary-pill"
              style={{ marginTop: "1rem" }}
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="terminal-roster-grid">
            {filteredChildren.map((child) => (
              <div key={child.id} className="child-terminal-card">
                <div>
                  <div className="child-card-header">
                    {child.photo_url ? (
                      <img src={child.photo_url} alt="" className="child-avatar-img" />
                    ) : (
                      <div className="child-avatar-img">{child.full_name.slice(0, 2).toUpperCase()}</div>
                    )}
                    <div className="child-meta">
                      <h3>{child.full_name}</h3>
                      <span>
                        {child.group_name} · Teacher: {child.caregiver_name}
                      </span>
                    </div>
                  </div>

                  {/* Allergy Alert if present */}
                  {child.allergies && (
                    <div
                      style={{
                        borderLeft: "2.5px solid #dc2626",
                        paddingLeft: "0.55rem",
                        color: "#991B1B",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        marginBottom: "0.75rem",
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: "0.3rem 0.45rem",
                        overflowWrap: "anywhere",
                        lineHeight: 1.4,
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontWeight: 700 }}>
                        <Icon name="alert" size={15} /> Care alert:
                      </span>
                      <span style={{ color: "var(--ink)" }}>{child.allergies}</span>
                    </div>
                  )}

                  {/* Status Indicator */}
                  <div>
                    {child.status === "not_arrived" && (
                      <span className="terminal-status-indicator not-arrived">
                        Expected today
                      </span>
                    )}
                    {child.status === "present" && (
                      <span className="terminal-status-indicator present">
                        At daycare {child.checkin_time ? `(Arrived ${child.checkin_time})` : ""}
                      </span>
                    )}
                    {child.status === "checked_out" && (
                      <span className="terminal-status-indicator checked-out">
                        Picked up {child.checkout_time ? `at ${child.checkout_time}` : ""}{" "}
                        {child.collector_name ? `by ${child.collector_name}` : ""}
                      </span>
                    )}
                    {child.status === "absent" && (
                      <span
                        className="terminal-status-indicator"
                        style={{ color: "var(--muted)" }}
                      >
                        Absent today
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Bottom Actions */}
                <div style={{ marginTop: "1rem" }}>
                  {child.status === "not_arrived" && (
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        onClick={() => handleCheckIn(child.id)}
                        disabled={actionBusy}
                        className="btn-terminal-action checkin"
                      >
                        <Icon name="check" size={17} /> Check in
                      </button>
                      <button
                        onClick={() => handleMarkAbsent(child.id)}
                        disabled={actionBusy}
                        style={{
                          background: "var(--cream-card)",
                          border: "1.5px solid var(--line)",
                          borderRadius: "9999px",
                          padding: "0 0.85rem",
                          color: "var(--muted)",
                          fontWeight: 700,
                          fontSize: "0.8rem",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                        title="Mark child absent if parent called in"
                      >
                        Absent
                      </button>
                    </div>
                  )}

                  {child.status === "present" && (
                    <button
                      onClick={() => openPickupModal(child)}
                      disabled={actionBusy}
                      className="btn-terminal-action checkout"
                    >
                      <Icon name="shield" size={17} /> Verify guardian &amp; check out
                    </button>
                  )}

                  {child.status === "checked_out" && (
                    <div
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "0.75rem",
                        borderRadius: "9999px",
                        border: "1px solid var(--line)",
                        background: "var(--cream-soft)",
                        color: "var(--muted)",
                        fontWeight: 700,
                        fontSize: "0.88rem",
                        textAlign: "center",
                      }}
                    >
                      Released for today
                    </div>
                  )}

                  {child.status === "absent" && (
                    <button
                      onClick={() => handleCheckIn(child.id)}
                      disabled={actionBusy}
                      className="btn-secondary-pill"
                      style={{ width: "100%", padding: "0.65rem", fontSize: "0.85rem" }}
                    >
                      Arrived Late? Check In Now
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ─── Verified Guardian Pickup Modal (SRS: FR-ATT-07, FR-BIO-04..08) ─── */}
      {selectedChildForPickup && (
        <div className="modal-backdrop" onClick={() => setSelectedChildForPickup(null)}>
          <div role="dialog" aria-modal="true" aria-label="Verify child pickup" className="pickup-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <button aria-label="Close pickup dialog" className="dialog-close" onClick={() => setSelectedChildForPickup(null)}>
              ✕
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <Icon name="shield" size={24} />
              <h2 style={{ fontSize: "1.45rem", fontWeight: 800, margin: 0 }}>
                Verified Child Pickup: {selectedChildForPickup.full_name}
              </h2>
            </div>
            <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: "0 0 1.25rem 0" }}>
              Classroom: <strong>{selectedChildForPickup.group_name}</strong> · Inspect and verify authorized adult
              identity before authorizing release.
            </p>

            {/* Authorized Guardians List */}
            <label style={{ display: "block", fontSize: "0.88rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              1. Select Authorized Adult Present at Front Desk:
            </label>
            <div className="guardian-select-list">
              {selectedChildForPickup.guardians.length === 0 ? (
                <div
                  style={{
                    color: "var(--navy)",
                    fontSize: "0.88rem",
                    padding: "1rem",
                    background: "var(--coral-soft)",
                    borderRadius: "14px",
                    fontWeight: 600,
                  }}
                >
                  No authorized adult guardians found on record for this child. Contact the daycare administrator
                  before releasing.
                </div>
              ) : (
                selectedChildForPickup.guardians.map((g) => {
                  const isSelected = selectedGuardianKey === g.key;
                  return (
                    <div
                      key={g.key}
                      className={`guardian-item-card ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedGuardianKey(g.key)}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <div
                          style={{
                            width: "20px",
                            height: "20px",
                            borderRadius: "50%",
                            border: isSelected ? "6px solid var(--navy)" : "2px solid var(--line)",
                            background: "var(--cream-card)",
                            boxSizing: "border-box",
                          }}
                        />
                        <div>
                          <strong style={{ display: "block", fontSize: "1rem", color: "var(--navy)" }}>{g.name}</strong>
                          <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                            {g.relationship} {g.phone ? `· ${g.phone}` : ""}
                          </span>
                        </div>
                      </div>
                      <span
                        style={{
                          background: "var(--green-soft)",
                          color: "#2E7D32",
                          fontWeight: 700,
                          fontSize: "0.75rem",
                          padding: "0.3rem 0.7rem",
                          borderRadius: "9999px",
                        }}
                      >
                        ✓ Authorized
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Verification Checklist */}
            <div
              style={{
                background: "#FFFBED",
                padding: "1.15rem",
                borderRadius: "16px",
                margin: "1.25rem 0",
                border: "1.5px solid var(--line)",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  fontWeight: 700,
                  color: "var(--navy)",
                }}
              >
                <input
                  type="checkbox"
                  checked={verifiedIdentityChecked}
                  onChange={(e) => setVerifiedIdentityChecked(e.target.checked)}
                  style={{ marginTop: "0.2rem", width: "19px", height: "19px", cursor: "pointer" }}
                />
                <span>
                  I confirm that I have inspected this adult's physical government ID / photo and verified their
                  authorized pickup status.
                </span>
              </label>

              <div style={{ marginTop: "0.85rem" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--muted)", marginBottom: "0.35rem" }}>
                  Staff Inspection Note / Reason (min 12 chars):
                </label>
                <input
                  type="text"
                  value={verificationReason}
                  onChange={(e) => setVerificationReason(e.target.value)}
                  placeholder="e.g., Visual photo ID checked and verified against authorized guardian record at front desk"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "0.6rem 0.85rem",
                    borderRadius: "10px",
                    border: "1px solid var(--line)",
                    fontSize: "0.85rem",
                    fontFamily: "inherit",
                  }}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "1rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
              <button
                type="button"
                onClick={() => setSelectedChildForPickup(null)}
                className="btn-secondary-pill"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  !selectedGuardianKey ||
                  !verifiedIdentityChecked ||
                  verificationReason.trim().length < 12 ||
                  actionBusy
                }
                onClick={handleCompletePickup}
                className="btn-primary-pill"
                style={{
                  opacity:
                    !selectedGuardianKey ||
                    !verifiedIdentityChecked ||
                    verificationReason.trim().length < 12 ||
                    actionBusy
                      ? 0.5
                      : 1,
                  cursor:
                    !selectedGuardianKey ||
                    !verifiedIdentityChecked ||
                    verificationReason.trim().length < 12 ||
                    actionBusy
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {actionBusy ? "Recording Release..." : "Confirm Pickup & Release Child ➔"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
