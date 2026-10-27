import React, { useEffect, useState, useMemo } from "react";
import "./caregiver.css";
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
    new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
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
        new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
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
      <div className="caregiver-terminal-container" style={{ alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#6B7280", fontSize: "1.1rem", fontWeight: 600 }}>Connecting to Front-Desk Terminal...</p>
      </div>
    );
  }

  // If not logged in as staff
  if (!actor) {
    return (
      <div className="caregiver-terminal-container" style={{ background: "#FDFCF7" }}>
        <div className="terminal-login-card">
          <div style={{ fontSize: "2.8rem", marginBottom: "0.5rem" }}>🛡️</div>
          <h2>Staff Front-Desk Terminal</h2>
          <p>Sign in with your Daycare Staff or Administrator credentials to begin check-in and pickup operations.</p>

          {loginError && (
            <div
              style={{
                background: "#FEE2E2",
                color: "#B91C1C",
                padding: "0.75rem 1rem",
                borderRadius: "12px",
                fontSize: "0.88rem",
                marginBottom: "1.25rem",
                textAlign: "left",
              }}
            >
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <input
              type="email"
              className="terminal-login-input"
              placeholder="Staff Email (e.g., staff@ankelba.com)"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
            />
            <input
              type="password"
              className="terminal-login-input"
              placeholder="Password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
            />
            <button
              type="submit"
              disabled={loginBusy}
              className="btn-primary-pill"
              style={{ width: "100%", padding: "0.85rem", fontSize: "1rem" }}
            >
              {loginBusy ? "Signing in..." : "Open Front-Desk Terminal ➔"}
            </button>
          </form>

          <div style={{ marginTop: "1.5rem", borderTop: "1px solid #E8E4DA", paddingTop: "1.25rem" }}>
            <span style={{ fontSize: "0.8rem", color: "#6B7280", display: "block", marginBottom: "0.75rem" }}>
              Quick Demo Staff Access:
            </span>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
              <button
                type="button"
                className="btn-secondary-pill"
                style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem" }}
                onClick={() => {
                  setLoginEmail("admin@ankelba.dev");
                  setLoginPassword("Admin@123!");
                }}
              >
                Fill Admin Credentials
              </button>
              <button
                type="button"
                className="btn-secondary-pill"
                style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem" }}
                onClick={() => {
                  setLoginEmail("caregiver@ankelba.dev");
                  setLoginPassword("Care@123!");
                }}
              >
                Fill Caregiver Credentials
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="caregiver-terminal-container">
      {/* ─── Top Terminal Header ─── */}
      <header className="terminal-header">
        <div className="terminal-title">
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span style={{ fontSize: "1.5rem" }}>👶</span>
            <h1>{data.daycare?.name || "Ankelba Daycare"} · Front-Desk Terminal</h1>
          </div>
          <p>
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}{" "}
            · <strong style={{ color: "#061224" }}>{currentTime}</strong> (Addis Ababa Time) · Duty Staff:{" "}
            <strong>{actor.name}</strong> ({actor.role})
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {actor.role === "admin" && (
            <a
              href="/admin/dashboard"
              style={{
                textDecoration: "none",
                fontSize: "0.85rem",
                fontWeight: 700,
                color: "#061224",
                padding: "0.5rem 1rem",
                borderRadius: "9999px",
                background: "#FEF7E6",
                border: "1px solid #E8E4DA",
              }}
            >
              🏢 Admin Portal ➔
            </a>
          )}
          <button
            onClick={fetchWorkspace}
            style={{
              background: "#FFFBED",
              border: "1px solid #E8E4DA",
              borderRadius: "9999px",
              padding: "0.55rem 1rem",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "0.85rem",
            }}
          >
            ↻ Refresh Roster
          </button>
          <button
            onClick={handleSignOut}
            style={{
              background: "#F3F4F6",
              border: "1px solid #D1D5DB",
              borderRadius: "9999px",
              padding: "0.55rem 1rem",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "0.85rem",
              color: "#374151",
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* ─── Real-Time Live Stats Bar ─── */}
      <div className="terminal-stats-bar">
        <div className="terminal-stat-chip">
          <span className="stat-dot green" />
          <span>At Daycare (Present): <strong>{presentCount}</strong></span>
        </div>
        <div className="terminal-stat-chip">
          <span className="stat-dot yellow" />
          <span>Expected Today: <strong>{notArrivedCount}</strong></span>
        </div>
        <div className="terminal-stat-chip">
          <span className="stat-dot navy" />
          <span>Released (Picked Up): <strong>{checkedOutCount}</strong></span>
        </div>
        {absentCount > 0 && (
          <div className="terminal-stat-chip" style={{ color: "#9CA3AF" }}>
            <span className="stat-dot" style={{ background: "#D1D5DB" }} />
            <span>Marked Absent: <strong>{absentCount}</strong></span>
          </div>
        )}
      </div>

      {/* ─── Feedback Banner ─── */}
      {feedback && (
        <div
          style={{
            maxWidth: 1300,
            margin: "1rem auto 0",
            width: "calc(100% - 5rem)",
            padding: "0.85rem 1.25rem",
            borderRadius: "14px",
            background: feedback.type === "success" ? "#EDF7ED" : "#FEE2E2",
            color: feedback.type === "success" ? "#1E4620" : "#B91C1C",
            fontWeight: 700,
            fontSize: "0.95rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{feedback.text}</span>
          <button
            onClick={() => setFeedback(null)}
            style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 800, fontSize: "1rem" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ─── Main Content Container ─── */}
      <main className="terminal-content">
        {/* Controls: Search, Classroom Group Filter & Status Tabs */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
            marginBottom: "1rem",
          }}
        >
          {/* Status Tabs */}
          <div className="terminal-filter-tabs">
            <button
              className={`terminal-filter-tab ${statusFilter === "all" ? "active" : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              All Children ({roster.length})
            </button>
            <button
              className={`terminal-filter-tab ${statusFilter === "not_arrived" ? "active" : ""}`}
              onClick={() => setStatusFilter("not_arrived")}
            >
              Expected Today ({notArrivedCount})
            </button>
            <button
              className={`terminal-filter-tab ${statusFilter === "present" ? "active" : ""}`}
              onClick={() => setStatusFilter("present")}
            >
              At Daycare ({presentCount})
            </button>
            <button
              className={`terminal-filter-tab ${statusFilter === "checked_out" ? "active" : ""}`}
              onClick={() => setStatusFilter("checked_out")}
            >
              Picked Up ({checkedOutCount})
            </button>
          </div>

          {/* Search & Group Filter */}
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              style={{
                padding: "0.6rem 1rem",
                borderRadius: "9999px",
                border: "1.5px solid #E8E4DA",
                fontFamily: "inherit",
                fontSize: "0.85rem",
                background: "#FFFFFF",
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
              placeholder="🔍 Search child by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: "0.6rem 1rem",
                borderRadius: "9999px",
                border: "1.5px solid #E8E4DA",
                fontFamily: "inherit",
                fontSize: "0.88rem",
                width: "220px",
              }}
            />
          </div>
        </div>

        {/* Child Roster Grid */}
        {loading ? (
          <p style={{ textAlign: "center", color: "#6B7280", margin: "4rem 0", fontSize: "1.05rem" }}>
            Loading children roster & live attendance...
          </p>
        ) : error ? (
          <div style={{ textAlign: "center", margin: "4rem 0" }}>
            <p style={{ color: "#C2185B", fontWeight: 700, fontSize: "1.05rem" }}>{error}</p>
            <button onClick={fetchWorkspace} className="btn-secondary-pill" style={{ marginTop: "1rem" }}>
              Try Reconnecting
            </button>
          </div>
        ) : filteredChildren.length === 0 ? (
          <div style={{ textAlign: "center", color: "#6B7280", margin: "4rem 0", padding: "3rem", background: "#FFFFFF", borderRadius: "20px", border: "1px solid #E8E4DA" }}>
            <span style={{ fontSize: "2.5rem", display: "block", marginBottom: "0.5rem" }}>🔍</span>
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
                        background: "#FEF2F2",
                        color: "#991B1B",
                        padding: "0.35rem 0.65rem",
                        borderRadius: "8px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        marginBottom: "0.75rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.35rem",
                      }}
                    >
                      <span>⚠️ Alert:</span>
                      <span>{child.allergies}</span>
                    </div>
                  )}

                  {/* Status Indicator */}
                  <div>
                    {child.status === "not_arrived" && (
                      <span className="terminal-status-indicator not-arrived">
                        ● Expected Today
                      </span>
                    )}
                    {child.status === "present" && (
                      <span className="terminal-status-indicator present">
                        ● At Daycare {child.checkin_time ? `(Arrived ${child.checkin_time})` : ""}
                      </span>
                    )}
                    {child.status === "checked_out" && (
                      <span className="terminal-status-indicator checked-out">
                        ✓ Picked Up {child.checkout_time ? `at ${child.checkout_time}` : ""}{" "}
                        {child.collector_name ? `by ${child.collector_name}` : ""}
                      </span>
                    )}
                    {child.status === "absent" && (
                      <span
                        className="terminal-status-indicator"
                        style={{ background: "#F3F4F6", color: "#6B7280" }}
                      >
                        ○ Marked Absent Today
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
                        ✓ Morning Check-In
                      </button>
                      <button
                        onClick={() => handleMarkAbsent(child.id)}
                        disabled={actionBusy}
                        style={{
                          background: "#FFFFFF",
                          border: "1.5px solid #E5E7EB",
                          borderRadius: "9999px",
                          padding: "0 0.85rem",
                          color: "#6B7280",
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
                      🛡️ Verify Guardian &amp; Release Child ➔
                    </button>
                  )}

                  {child.status === "checked_out" && (
                    <div
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "0.75rem",
                        borderRadius: "9999px",
                        border: "1px solid #E8E4DA",
                        background: "#F9FAFB",
                        color: "#9CA3AF",
                        fontWeight: 700,
                        fontSize: "0.88rem",
                        textAlign: "center",
                      }}
                    >
                      ✓ Released for Today
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
          <div className="pickup-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <button className="dialog-close" onClick={() => setSelectedChildForPickup(null)}>
              ✕
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "1.6rem" }}>🛡️</span>
              <h2 style={{ fontSize: "1.45rem", fontWeight: 800, margin: 0 }}>
                Verified Child Pickup: {selectedChildForPickup.full_name}
              </h2>
            </div>
            <p style={{ color: "#6B7280", fontSize: "0.9rem", margin: "0 0 1.25rem 0" }}>
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
                    color: "#B91C1C",
                    fontSize: "0.88rem",
                    padding: "1rem",
                    background: "#FEE2E2",
                    borderRadius: "14px",
                    fontWeight: 600,
                  }}
                >
                  ⚠️ No authorized adult guardians found on record for this child. Contact the daycare administrator
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
                            border: isSelected ? "6px solid #061224" : "2px solid #D1D5DB",
                            background: "#FFFFFF",
                            boxSizing: "border-box",
                          }}
                        />
                        <div>
                          <strong style={{ display: "block", fontSize: "1rem", color: "#061224" }}>{g.name}</strong>
                          <span style={{ fontSize: "0.82rem", color: "#6B7280" }}>
                            {g.relationship} {g.phone ? `· 📞 ${g.phone}` : ""}
                          </span>
                        </div>
                      </div>
                      <span
                        style={{
                          background: "#EDF7ED",
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
                border: "1.5px solid #E8E4DA",
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
                  color: "#061224",
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
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#4B5563", marginBottom: "0.35rem" }}>
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
                    border: "1px solid #D1D5DB",
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
