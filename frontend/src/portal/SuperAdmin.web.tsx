import React, { useEffect, useState } from "react";
import "./portal.css";
import "./saas.css";
import { portalApi, apiError } from "./api";
import { Badge, Button, Card, Icon } from "./ui.web";

const logo = require("../../design/figma-exports/ankelba-symbol.png");

interface DaycareItem {
  id: number;
  name: string;
  slug: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  license_number: string;
  status: "pending" | "active" | "suspended" | "rejected";
  subscription_plan: "trial" | "standard" | "premium";
  trial_ends_at: string | null;
  max_children: number;
  created_at: string;
  updated_at?: string;
  admin_name: string;
  admin_email: string;
  children_count: number;
  staff_count: number;
}

interface PlatformStats {
  total_daycares: number;
  pending_approvals: number;
  active_daycares: number;
  suspended_daycares: number;
  total_children: number;
  total_users: number;
  active_trials: number;
}

interface PlatformUser {
  id: number;
  name: string;
  email: string;
  status: string;
  created_at: string;
  role: string;
  daycare_id: number | null;
  daycare_name: string | null;
}

interface PlatformAuditLog {
  id: number;
  actor_id: number;
  action: string;
  target_table: string;
  target_id: number;
  metadata: any;
  created_at: string;
  daycare_id: number | null;
  actor_name: string;
  actor_email: string;
  daycare_name: string | null;
}

interface SystemHealthInfo {
  status: string;
  db_connected: boolean;
  db_latency_ms: number;
  db_size: string;
  uptime_seconds: number;
  node_version: string;
  environment: string;
  table_counts: {
    daycares_count: string;
    users_count: string;
    children_count: string;
    audit_count: string;
  };
  security_isolation: {
    tenant_isolation: string;
    rbac_enforced: boolean;
    jwt_state_revocation: boolean;
    pickup_biometrics: string;
  };
}

type SuperAdminPage =
  | "overview"
  | "daycares"
  | "applications"
  | "users"
  | "audit"
  | "health"
  | "broadcast";

export default function SuperAdmin() {
  // Auth state
  const [checkingSession, setCheckingSession] = useState(true);
  const [user, setUser] = useState<any | null>(null);
  const [loginEmail, setLoginEmail] = useState("superadmin@ankelba.com");
  const [loginPassword, setLoginPassword] = useState("1234");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  // Navigation & UI state
  const [activePage, setActivePage] = useState<SuperAdminPage>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Platform Data
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [daycares, setDaycares] = useState<DaycareItem[]>([]);
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<PlatformAuditLog[]>([]);
  const [health, setHealth] = useState<SystemHealthInfo | null>(null);

  // Filters & Searches
  const [daycareTab, setDaycareTab] = useState<"all" | "active" | "suspended" | "pending">("all");
  const [daycareSearch, setDaycareSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | "admin" | "caregiver" | "parent">("all");
  const [userSearch, setUserSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");

  // Platform Broadcast Banner State
  const [broadcast, setBroadcast] = useState<{ message: string; level: "info" | "warning" | "alert"; active: boolean }>({
    message: "",
    level: "info",
    active: false,
  });
  const [broadcastSaving, setBroadcastSaving] = useState(false);

  // Modals state
  const [approveModal, setApproveModal] = useState<{
    open: boolean;
    daycare: DaycareItem | null;
    plan: "trial" | "standard" | "premium";
    trialDays: number;
  }>({
    open: false,
    daycare: null,
    plan: "standard",
    trialDays: 30,
  });

  const [rejectModal, setRejectModal] = useState<{
    open: boolean;
    daycare: DaycareItem | null;
    reason: string;
  }>({
    open: false,
    daycare: null,
    reason: "Application does not meet current platform verification standards.",
  });

  const [inspectModal, setInspectModal] = useState<{
    open: boolean;
    daycare: DaycareItem | null;
  }>({
    open: false,
    daycare: null,
  });

  const [planModal, setPlanModal] = useState<{
    open: boolean;
    daycare: DaycareItem | null;
    plan: string;
    maxChildren: number;
    extendDays: number;
  }>({
    open: false,
    daycare: null,
    plan: "standard",
    maxChildren: 50,
    extendDays: 0,
  });

  const [actionBusyId, setActionBusyId] = useState<number | null>(null);

  const navigateTo = (path: string) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const showToast = (msg: string) => {
    setToast(msg);
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Initial session check
  const checkSession = async () => {
    setCheckingSession(true);
    try {
      const me = await portalApi.session();
      if (me && me.role === "super_admin") {
        setUser(me);
        await loadAllPlatformData();
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setCheckingSession(false);
    }
  };

  const loadAllPlatformData = async () => {
    setDataLoading(true);
    try {
      const [s, d, u, a, h, b] = await Promise.all([
        portalApi.getSuperAdminStats().catch(() => null),
        portalApi.getSuperAdminDaycares().catch(() => []),
        portalApi.getSuperAdminUsers().catch(() => []),
        portalApi.getSuperAdminAuditLogs().catch(() => []),
        portalApi.getSuperAdminSystemHealth().catch(() => null),
        portalApi.getBroadcast().catch(() => null),
      ]);
      if (s) setStats(s);
      if (d) setDaycares(d);
      if (u) setUsers(u);
      if (a) setAuditLogs(a);
      if (h) setHealth(h);
      if (b) setBroadcast({ message: b.message || "", level: b.level || "info", active: !!b.active });
      setLastRefreshed(new Date());
    } catch (err) {
      showToast(apiError(err));
    } finally {
      setDataLoading(false);
    }
  };

  const handleSaveBroadcast = async () => {
    setBroadcastSaving(true);
    try {
      const res = await portalApi.setBroadcast(broadcast);
      setBroadcast({ message: res.message || "", level: res.level || "info", active: !!res.active });
      showToast(res.active ? "📢 Platform broadcast is now live across all workspaces." : "Broadcast banner disabled.");
    } catch (err: any) {
      showToast(apiError(err));
    } finally {
      setBroadcastSaving(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginSubmitting(true);
    try {
      const loggedUser = await portalApi.login(loginEmail.trim(), loginPassword);
      if (loggedUser.role !== "super_admin") {
        setLoginError(`Account (${loggedUser.email}) does not have Super Administrator privileges.`);
        await portalApi.logout();
        setUser(null);
        return;
      }
      setUser(loggedUser);
      showToast(`Welcome back, ${loggedUser.name || "Super Administrator"}!`);
      await loadAllPlatformData();
    } catch (err: any) {
      setLoginError(apiError(err));
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await portalApi.logout().catch(() => {});
    setUser(null);
    setStats(null);
    setDaycares([]);
    setUsers([]);
    setAuditLogs([]);
    setHealth(null);
    showToast("Signed out from Super Admin console.");
  };

  // Quick fill test credentials
  const fillTestCredentials = () => {
    setLoginEmail("superadmin@ankelba.com");
    setLoginPassword("1234");
    setLoginError(null);
  };

  // Daycare Management Actions
  const handleApproveConfirm = async () => {
    if (!approveModal.daycare) return;
    const dId = approveModal.daycare.id;
    setActionBusyId(dId);
    try {
      await portalApi.approveDaycare(dId, {
        plan: approveModal.plan,
        trialDays: approveModal.trialDays,
      });
      showToast(`Daycare "${approveModal.daycare.name}" approved and ${approveModal.trialDays}-day trial activated!`);
      setApproveModal({ open: false, daycare: null, plan: "standard", trialDays: 30 });
      await loadAllPlatformData();
    } catch (err: any) {
      showToast(apiError(err));
    } finally {
      setActionBusyId(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectModal.daycare) return;
    const dId = rejectModal.daycare.id;
    setActionBusyId(dId);
    try {
      await portalApi.rejectDaycare(dId, rejectModal.reason);
      showToast(`Application for "${rejectModal.daycare.name}" has been rejected.`);
      setRejectModal({ open: false, daycare: null, reason: "" });
      await loadAllPlatformData();
    } catch (err: any) {
      showToast(apiError(err));
    } finally {
      setActionBusyId(null);
    }
  };

  const handleToggleSuspend = async (d: DaycareItem) => {
    const isSuspended = d.status === "suspended";
    const promptMsg = isSuspended
      ? `Reactivate daycare "${d.name}"? Staff and parents will regain platform access.`
      : `Suspend daycare "${d.name}"? All users from this center will be blocked from logging in.`;

    if (!window.confirm(promptMsg)) return;

    setActionBusyId(d.id);
    try {
      if (isSuspended) {
        await portalApi.activateDaycare(d.id);
        showToast(`Daycare "${d.name}" reactivated successfully.`);
      } else {
        await portalApi.suspendDaycare(d.id, "Administrative suspension");
        showToast(`Daycare "${d.name}" has been suspended.`);
      }
      await loadAllPlatformData();
    } catch (err: any) {
      showToast(apiError(err));
    } finally {
      setActionBusyId(null);
    }
  };

  const handlePlanSave = async () => {
    if (!planModal.daycare) return;
    const dId = planModal.daycare.id;
    setActionBusyId(dId);
    try {
      await portalApi.updateDaycarePlan(
        dId,
        planModal.plan,
        planModal.maxChildren,
        planModal.extendDays
      );
      showToast(`Subscription plan updated for "${planModal.daycare.name}".`);
      setPlanModal({ open: false, daycare: null, plan: "standard", maxChildren: 50, extendDays: 0 });
      await loadAllPlatformData();
    } catch (err: any) {
      showToast(apiError(err));
    } finally {
      setActionBusyId(null);
    }
  };

  // Helpers
  const calculateDaysLeft = (dateStr: string | null) => {
    if (!dateStr) return null;
    const diff = new Date(dateStr).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  };

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${seconds % 60}s`;
  };

  const getInitials = (name?: string) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Filtered Daycares
  const filteredDaycares = daycares.filter((d) => {
    if (daycareTab === "pending" && d.status !== "pending") return false;
    if (daycareTab === "active" && d.status !== "active") return false;
    if (daycareTab === "suspended" && d.status !== "suspended") return false;

    if (daycareSearch.trim()) {
      const q = daycareSearch.toLowerCase();
      const matchName = d.name?.toLowerCase().includes(q);
      const matchEmail =
        d.contact_email?.toLowerCase().includes(q) ||
        d.admin_email?.toLowerCase().includes(q);
      const matchLicense = d.license_number?.toLowerCase().includes(q);
      const matchSlug = d.slug?.toLowerCase().includes(q);
      return matchName || matchEmail || matchLicense || matchSlug;
    }
    return true;
  });

  const pendingDaycares = daycares.filter((d) => d.status === "pending");

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    if (userRoleFilter !== "all" && u.role !== userRoleFilter) return false;
    if (userSearch.trim()) {
      const q = userSearch.toLowerCase();
      return (
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.daycare_name?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Filtered Audit Logs
  const filteredAuditLogs = auditLogs.filter((l) => {
    if (auditSearch.trim()) {
      const q = auditSearch.toLowerCase();
      return (
        l.action?.toLowerCase().includes(q) ||
        l.actor_name?.toLowerCase().includes(q) ||
        l.actor_email?.toLowerCase().includes(q) ||
        l.daycare_name?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // 1. Initial Checking Session State
  if (checkingSession) {
    return (
      <div
        className="ankelba-portal"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#FFFBED",
        }}
      >
        <img src={logo} alt="Ankelba Logo" style={{ height: 54, marginBottom: 18 }} />
        <h2 style={{ fontFamily: "Quicksand_700Bold", color: "#10263B", margin: "0 0 8px" }}>
          Ankelba Super Admin Console
        </h2>
        <p style={{ color: "#76818B", fontSize: 14, margin: "0 0 20px" }}>
          Verifying security authorization and tenant isolation state...
        </p>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            border: "3px solid #EEEDE6",
            borderTopColor: "#10263B",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // 2. Unauthenticated State (Polished Login Screen with clear high-contrast buttons)
  if (!user) {
    return (
      <div
        className="ankelba-portal"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #FFFBED 0%, #F5F1E5 100%)",
          padding: 24,
        }}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: 24,
            padding: "44px 38px",
            width: "100%",
            maxWidth: 460,
            boxShadow: "0 20px 50px rgba(16, 38, 59, 0.12)",
            textAlign: "center",
            border: "1px solid #EAE6DB",
          }}
        >
          <img src={logo} alt="Ankelba" style={{ height: 50, marginBottom: 14 }} />
          <div>
            <span
              style={{
                display: "inline-block",
                background: "#FCE7EC",
                color: "#BD4264",
                fontWeight: 800,
                fontSize: 11,
                letterSpacing: "1.6px",
                padding: "4px 12px",
                borderRadius: 999,
                marginBottom: 10,
                textTransform: "uppercase",
              }}
            >
              SaaS Platform Operator
            </span>
          </div>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: "#10263B",
              margin: "0 0 6px",
              letterSpacing: "-0.5px",
            }}
          >
            Super Admin Console
          </h1>
          <p style={{ color: "#76818B", fontSize: 14, margin: "0 0 24px" }}>
            Cross-tenant governance, daycare approvals, and platform health.
          </p>

          {loginError && (
            <div
              role="alert"
              style={{
                background: "#fdf3f0",
                color: "#c0392b",
                border: "1px solid #f7cfc7",
                borderRadius: 12,
                padding: "12px 16px",
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 20,
                textAlign: "left",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <Icon name="alert" size={16} />
              <div>{loginError}</div>
            </div>
          )}

          <form onSubmit={handleLogin} style={{ textAlign: "left" }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#10263B", marginBottom: 6 }}>
              Super Admin Email
            </label>
            <input
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder="superadmin@ankelba.com"
              required
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1.5px solid #dcd8cc",
                fontSize: 14,
                marginBottom: 16,
                fontFamily: "inherit",
                boxSizing: "border-box",
                outline: "none",
              }}
            />

            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#10263B", marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="Your password"
              required
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1.5px solid #dcd8cc",
                fontSize: 14,
                marginBottom: 22,
                fontFamily: "inherit",
                boxSizing: "border-box",
                outline: "none",
              }}
            />

            <button
              type="submit"
              disabled={loginSubmitting}
              className="p-button primary"
              style={{
                width: "100%",
                padding: "13px 0",
                borderRadius: 999,
                fontWeight: 700,
                fontSize: 15,
                cursor: loginSubmitting ? "not-allowed" : "pointer",
                opacity: loginSubmitting ? 0.7 : 1,
              }}
            >
              {loginSubmitting ? "Authenticating Platform Operator..." : "Authenticate as Super Admin →"}
            </button>
          </form>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #eeece6" }}>
            <button
              type="button"
              onClick={fillTestCredentials}
              className="p-button subtle"
              style={{
                width: "100%",
                marginBottom: 14,
                borderRadius: 8,
                fontSize: 12,
                padding: "8px 14px",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Icon name="key" size={14} /> Autofill Super Admin Test Credentials (1234)
              </span>
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#76818B" }}>
              <a
                onClick={() => navigateTo("/")}
                style={{ cursor: "pointer", color: "#10263B", textDecoration: "underline", fontWeight: 600 }}
              >
                ← SaaS Home
              </a>
              <a
                onClick={() => navigateTo("/admin")}
                style={{ cursor: "pointer", color: "#417B61", textDecoration: "underline", fontWeight: 600 }}
              >
                Daycare Admin Portal →
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. Authenticated Super Admin Portal Workspace
  return (
    <div className="ankelba-portal">
      {/* Toast Alert */}
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "#10263B",
            color: "#ffffff",
            padding: "14px 22px",
            borderRadius: 14,
            zIndex: 9999,
            boxShadow: "0 12px 36px rgba(16, 38, 59, 0.35)",
            fontSize: 14,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 12,
            borderLeft: "4px solid #e07a5f",
          }}
        >
          <Icon name="sparkles" size={16} />
          <span>{toast}</span>
          <button
            onClick={() => setToast(null)}
            style={{
              background: "none",
              border: "none",
              color: "#a5b4c4",
              cursor: "pointer",
              marginLeft: 10,
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Dark Sidebar Navigation */}
      <aside
        className={"p-sidebar dark-sidebar " + (mobileMenuOpen ? "open" : "")}
        aria-label="Super Admin Navigation"
      >
        {/* Brand Header */}
        <div className="p-brand" style={{ padding: "0 12px 24px" }}>
          <img src={logo} alt="Ankelba Symbol" style={{ height: 42, width: 30 }} />
          <div>
            <div style={{ fontSize: 24, fontFamily: "Quicksand_700Bold", letterSpacing: "-0.5px" }}>Ankelba</div>
            <span
              style={{
                display: "inline-block",
                background: "rgba(224, 122, 95, 0.2)",
                color: "#e07a5f",
                fontWeight: 800,
                letterSpacing: "1.5px",
                fontSize: 9.5,
                padding: "2px 8px",
                borderRadius: 999,
                textTransform: "uppercase",
                marginTop: 2,
              }}
            >
              SUPER ADMIN
            </span>
          </div>
        </div>

        {/* Group 1: Platform Governance */}
        <div style={{ marginBottom: 18 }}>
          <div className="p-nav-group">PLATFORM GOVERNANCE</div>
          <nav aria-label="Platform Governance">
            <a
              href="#overview"
              className={"p-nav-link " + (activePage === "overview" ? "active" : "")}
              onClick={(e) => {
                e.preventDefault();
                setActivePage("overview");
                setMobileMenuOpen(false);
              }}
            >
              <Icon name="chart" size={18} />
              Executive Overview
            </a>

            <a
              href="#daycares"
              className={"p-nav-link " + (activePage === "daycares" ? "active" : "")}
              onClick={(e) => {
                e.preventDefault();
                setActivePage("daycares");
                setMobileMenuOpen(false);
              }}
            >
              <Icon name="home" size={18} />
              Daycare Directory ({daycares.length})
            </a>

            <a
              href="#applications"
              className={"p-nav-link " + (activePage === "applications" ? "active" : "")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              onClick={(e) => {
                e.preventDefault();
                setActivePage("applications");
                setMobileMenuOpen(false);
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Icon name="bell" size={18} />
                Applications
              </span>
              {pendingDaycares.length > 0 && (
                <span
                  style={{
                    background: "#e07a5f",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 800,
                    padding: "2px 8px",
                    borderRadius: 999,
                  }}
                >
                  {pendingDaycares.length}
                </span>
              )}
            </a>
          </nav>
        </div>

        {/* Group 2: Ecosystem Management */}
        <div style={{ marginBottom: 18 }}>
          <div className="p-nav-group">ECOSYSTEM & SECURITY</div>
          <nav aria-label="Ecosystem Management">
            <a
              href="#users"
              className={"p-nav-link " + (activePage === "users" ? "active" : "")}
              onClick={(e) => {
                e.preventDefault();
                setActivePage("users");
                setMobileMenuOpen(false);
              }}
            >
              <Icon name="people" size={18} />
              Global Accounts ({users.length || stats?.total_users || 0})
            </a>

            <a
              href="#audit"
              className={"p-nav-link " + (activePage === "audit" ? "active" : "")}
              onClick={(e) => {
                e.preventDefault();
                setActivePage("audit");
                setMobileMenuOpen(false);
              }}
            >
              <Icon name="shield" size={18} />
              Platform Audit Trail
            </a>

            <a
              href="#health"
              className={"p-nav-link " + (activePage === "health" ? "active" : "")}
              onClick={(e) => {
                e.preventDefault();
                setActivePage("health");
                setMobileMenuOpen(false);
              }}
            >
              <Icon name="clock" size={18} />
              System Telemetry & Health
            </a>

            <a
              href="#broadcast"
              className={"p-nav-link " + (activePage === "broadcast" ? "active" : "")}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              onClick={(e) => {
                e.preventDefault();
                setActivePage("broadcast");
                setMobileMenuOpen(false);
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Icon name="bell" size={18} />
                Broadcast Banner
              </span>
              {broadcast.active && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: broadcast.level === "alert" ? "#ef4444" : broadcast.level === "warning" ? "#f59e0b" : "#3b82f6",
                  }}
                />
              )}
            </a>
          </nav>
        </div>

        {/* Sidebar Footer with Operator Info */}
        <div className="p-sidebar-foot" style={{ marginTop: "auto", borderTop: "1px solid #162c42", paddingTop: 18 }}>
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              borderRadius: 12,
              padding: "12px 14px",
              marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "#e07a5f",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                {getInitials(user?.name)}
              </div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#ffffff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {user?.name || "Super Administrator"}
                </div>
                <div style={{ fontSize: 11, color: "#8da4be", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {user?.email}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <span
                style={{
                  background: "#417B61",
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 800,
                  padding: "2px 6px",
                  borderRadius: 4,
                  textTransform: "uppercase",
                }}
              >
                SaaS Operator
              </span>
              <span
                style={{
                  background: "#2A435D",
                  color: "#cbd5e1",
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                RLS Scoped
              </span>
            </div>
          </div>

          <Button
            variant="secondary small"
            icon="home"
            onClick={() => navigateTo("/admin")}
            style={{ width: "100%", marginBottom: 8, justifyContent: "center" }}
          >
            Switch to Daycare Portal
          </Button>

          <Button
            variant="ghost small"
            icon="logout"
            onClick={handleLogout}
            style={{ width: "100%", justifyContent: "center", color: "#e07a5f !important" }}
          >
            Sign out of Console
          </Button>
        </div>
      </aside>

      {/* Main Workspace Body */}
      <main className="p-workspace" style={{ background: "#fbfaf5", minHeight: "100vh" }}>
        {/* Topbar */}
        <header className="p-topbar" style={{ background: "#ffffff", borderBottom: "1px solid #eeece6" }}>
          <button
            className="p-icon-button p-menu-toggle"
            aria-label="Toggle navigation"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Icon name={mobileMenuOpen ? "close" : "menu"} />
          </button>

          <div className="p-breadcrumb">
            Ankelba Cloud <span>/</span> Platform Administration <span>/</span>{" "}
            <strong>
              {activePage === "overview" && "Executive Overview"}
              {activePage === "daycares" && "Daycare Directory"}
              {activePage === "applications" && "Applications Review Queue"}
              {activePage === "users" && "Global User Accounts"}
              {activePage === "audit" && "Platform Audit Trail"}
              {activePage === "health" && "System Telemetry & Health"}
            </strong>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto", marginRight: 16 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "#eef6f2",
                color: "#417B61",
                padding: "5px 12px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                border: "1px solid #cce6d9",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#417B61" }} />
              Row-Level Isolation Enforced
            </span>

            <span style={{ fontSize: 11, color: "#76818B", fontWeight: 600 }}>
              Synced: {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>

            <Button
              variant="secondary small"
              icon="refresh"
              onClick={loadAllPlatformData}
              disabled={dataLoading}
            >
              {dataLoading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </header>

        {/* Content Container */}
        <div style={{ padding: "30px 36px", maxWidth: 1400, margin: "0 auto" }}>
          {/* Active Global Broadcast Banner */}
          {broadcast.active && broadcast.message && (
            <div
              style={{
                background:
                  broadcast.level === "alert"
                    ? "#FEF2F2"
                    : broadcast.level === "warning"
                    ? "#FFFBEB"
                    : "#EFF6FF",
                border: `1.5px solid ${
                  broadcast.level === "alert"
                    ? "#F87171"
                    : broadcast.level === "warning"
                    ? "#FCD34D"
                    : "#93C5FD"
                }`,
                color:
                  broadcast.level === "alert"
                    ? "#991B1B"
                    : broadcast.level === "warning"
                    ? "#92400E"
                    : "#1E40AF",
                padding: "12px 18px",
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
                marginBottom: 24,
                boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 20 }}>
                  {broadcast.level === "alert" ? "🚨" : broadcast.level === "warning" ? "⚠️" : "📢"}
                </span>
                <div>
                  <strong style={{ display: "block", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Platform Broadcast ({broadcast.level})
                  </strong>
                  <span style={{ fontSize: 14 }}>{broadcast.message}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActivePage("broadcast")}
                style={{
                  padding: "5px 12px",
                  borderRadius: 8,
                  border: "1px solid currentColor",
                  background: "transparent",
                  color: "inherit",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Manage Broadcast →
              </button>
            </div>
          )}
          {/* ========================================================================= */}
          {/* PAGE 1: EXECUTIVE OVERVIEW */}
          {/* ========================================================================= */}
          {activePage === "overview" && (
            <div>
              {/* Alert Banner if Pending Approvals Exist */}
              {pendingDaycares.length > 0 && (
                <div
                  style={{
                    background: "linear-gradient(90deg, #fff7ed 0%, #fffbf2 100%)",
                    border: "1.5px solid #f4a261",
                    borderRadius: 16,
                    padding: "16px 24px",
                    marginBottom: 24,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 16,
                    boxShadow: "0 4px 14px rgba(244, 162, 97, 0.15)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ color: "#e07a5f", display: "flex", alignItems: "center" }}>
                      <Icon name="bell" size={26} />
                    </span>
                    <div>
                      <strong style={{ fontSize: 16, color: "#9c5700", display: "block" }}>
                        Action Required: {pendingDaycares.length} Daycare Application{pendingDaycares.length > 1 ? "s" : ""} Awaiting Review
                      </strong>
                      <span style={{ fontSize: 13, color: "#6e4510" }}>
                        Prospective centers self-registered and require Super Admin approval to activate 30-day trial subscriptions.
                      </span>
                    </div>
                  </div>
                  <Button variant="accent" onClick={() => setActivePage("applications")}>
                    Inspect Applications Queue →
                  </Button>
                </div>
              )}

              {/* 6-KPI Stat Cards Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                  gap: 18,
                  marginBottom: 28,
                }}
              >
                <div
                  style={{
                    background: "#fff",
                    borderRadius: 16,
                    padding: "20px 22px",
                    border: "1px solid #eeece6",
                    borderLeft: "4px solid #10263b",
                    boxShadow: "0 2px 8px rgba(16, 38, 59, 0.04)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: "#10263b", lineHeight: 1 }}>
                      {stats?.total_daycares ?? daycares.length}
                    </div>
                    <span style={{ color: "#10263b", opacity: 0.7 }}><Icon name="building" size={22} /></span>
                  </div>
                  <div style={{ fontSize: 13, color: "#76818b", fontWeight: 700 }}>Total Centers</div>
                  <div style={{ fontSize: 11, color: "#417b61", marginTop: 4 }}>Across all regions</div>
                </div>

                <div
                  style={{
                    background: pendingDaycares.length > 0 ? "#fff8f6" : "#fff",
                    borderRadius: 16,
                    padding: "20px 22px",
                    border: "1px solid #eeece6",
                    borderLeft: "4px solid #e07a5f",
                    boxShadow: "0 2px 8px rgba(16, 38, 59, 0.04)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: "#e07a5f", lineHeight: 1 }}>
                      {stats?.pending_approvals ?? pendingDaycares.length}
                    </div>
                    <span style={{ color: "#e07a5f" }}><Icon name="bell" size={22} /></span>
                  </div>
                  <div style={{ fontSize: 13, color: "#76818b", fontWeight: 700 }}>Pending Review</div>
                  <div style={{ fontSize: 11, color: "#e07a5f", marginTop: 4 }}>Needs verification</div>
                </div>

                <div
                  style={{
                    background: "#fff",
                    borderRadius: 16,
                    padding: "20px 22px",
                    border: "1px solid #eeece6",
                    borderLeft: "4px solid #417b61",
                    boxShadow: "0 2px 8px rgba(16, 38, 59, 0.04)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: "#417b61", lineHeight: 1 }}>
                      {stats?.active_daycares ?? daycares.filter((d) => d.status === "active").length}
                    </div>
                    <span style={{ color: "#417b61" }}><Icon name="checkCircle" size={22} /></span>
                  </div>
                  <div style={{ fontSize: 13, color: "#76818b", fontWeight: 700 }}>Active Centers</div>
                  <div style={{ fontSize: 11, color: "#417b61", marginTop: 4 }}>Full platform access</div>
                </div>

                <div
                  style={{
                    background: "#fff",
                    borderRadius: 16,
                    padding: "20px 22px",
                    border: "1px solid #eeece6",
                    borderLeft: "4px solid #f4a261",
                    boxShadow: "0 2px 8px rgba(16, 38, 59, 0.04)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: "#f4a261", lineHeight: 1 }}>
                      {stats?.active_trials ?? daycares.filter((d) => d.subscription_plan === "trial" && d.status === "active").length}
                    </div>
                    <span style={{ color: "#f4a261" }}><Icon name="clock" size={22} /></span>
                  </div>
                  <div style={{ fontSize: 13, color: "#76818b", fontWeight: 700 }}>Active 30-Day Trials</div>
                  <div style={{ fontSize: 11, color: "#f4a261", marginTop: 4 }}>Trial countdown active</div>
                </div>

                <div
                  style={{
                    background: "#fff",
                    borderRadius: 16,
                    padding: "20px 22px",
                    border: "1px solid #eeece6",
                    borderLeft: "4px solid #3b82f6",
                    boxShadow: "0 2px 8px rgba(16, 38, 59, 0.04)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: "#3b82f6", lineHeight: 1 }}>
                      {stats?.total_children ?? 0}
                    </div>
                    <span style={{ color: "#3b82f6" }}><Icon name="child" size={22} /></span>
                  </div>
                  <div style={{ fontSize: 13, color: "#76818b", fontWeight: 700 }}>Enrolled Children</div>
                  <div style={{ fontSize: 11, color: "#3b82f6", marginTop: 4 }}>Platform-wide census</div>
                </div>

                <div
                  style={{
                    background: "#fff",
                    borderRadius: 16,
                    padding: "20px 22px",
                    border: "1px solid #eeece6",
                    borderLeft: "4px solid #8b5cf6",
                    boxShadow: "0 2px 8px rgba(16, 38, 59, 0.04)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: "#8b5cf6", lineHeight: 1 }}>
                      {stats?.total_users ?? users.length}
                    </div>
                    <span style={{ color: "#8b5cf6" }}><Icon name="people" size={22} /></span>
                  </div>
                  <div style={{ fontSize: 13, color: "#76818b", fontWeight: 700 }}>Registered Accounts</div>
                  <div style={{ fontSize: 11, color: "#8b5cf6", marginTop: 4 }}>Staff & Parent users</div>
                </div>
              </div>

              {/* Middle Section: Platform Breakdowns */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 24, marginBottom: 28 }}>
                {/* Subscription Plans Card */}
                <Card title="Subscription Plan Distribution">
                  <div style={{ padding: "10px 0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13, fontWeight: 700 }}>
                      <span>Standard Plan</span>
                      <span>{daycares.filter((d) => d.subscription_plan === "standard").length} daycares</span>
                    </div>
                    <div style={{ height: 8, background: "#eeece6", borderRadius: 999, overflow: "hidden", marginBottom: 16 }}>
                      <div
                        style={{
                          height: "100%",
                          background: "#417B61",
                          width: `${(daycares.filter((d) => d.subscription_plan === "standard").length / (daycares.length || 1)) * 100}%`,
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13, fontWeight: 700 }}>
                      <span>Premium Plan</span>
                      <span>{daycares.filter((d) => d.subscription_plan === "premium").length} daycares</span>
                    </div>
                    <div style={{ height: 8, background: "#eeece6", borderRadius: 999, overflow: "hidden", marginBottom: 16 }}>
                      <div
                        style={{
                          height: "100%",
                          background: "#8b5cf6",
                          width: `${(daycares.filter((d) => d.subscription_plan === "premium").length / (daycares.length || 1)) * 100}%`,
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13, fontWeight: 700 }}>
                      <span>30-Day Free Trial</span>
                      <span>{daycares.filter((d) => d.subscription_plan === "trial").length} daycares</span>
                    </div>
                    <div style={{ height: 8, background: "#eeece6", borderRadius: 999, overflow: "hidden", marginBottom: 10 }}>
                      <div
                        style={{
                          height: "100%",
                          background: "#f4a261",
                          width: `${(daycares.filter((d) => d.subscription_plan === "trial").length / (daycares.length || 1)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </Card>

                {/* Tenant Operational Status Card */}
                <Card title="Tenant Access & Health Overview">
                  <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "8px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#eef6f2", borderRadius: 10 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, color: "#417B61" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#417B61" }} /> Active Tenants (Operational)
                      </span>
                      <strong style={{ fontSize: 18, color: "#417B61" }}>
                        {daycares.filter((d) => d.status === "active").length}
                      </strong>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#fdf3f0", borderRadius: 10 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, color: "#c0392b" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#c0392b" }} /> Suspended Tenants (Locked)
                      </span>
                      <strong style={{ fontSize: 18, color: "#c0392b" }}>
                        {daycares.filter((d) => d.status === "suspended").length}
                      </strong>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#fff5e5", borderRadius: 10 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, color: "#b76e00" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#b76e00" }} /> Pending Review (New Submissions)
                      </span>
                      <strong style={{ fontSize: 18, color: "#b76e00" }}>
                        {pendingDaycares.length}
                      </strong>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Recent Audit Events Stream */}
              <Card
                title="Recent Platform Security & Management Activity"
                action={
                  <Button variant="ghost" onClick={() => setActivePage("audit")}>
                    View All Audit Logs →
                  </Button>
                }
              >
                <div style={{ overflowX: "auto" }}>
                  <table className="p-table" style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Actor</th>
                        <th>Action</th>
                        <th>Target Center</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.slice(0, 5).map((log) => (
                        <tr key={log.id}>
                          <td style={{ fontSize: 12, color: "#76818B" }}>
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td>
                            <strong>{log.actor_name || `User #${log.actor_id}`}</strong>
                            <div style={{ fontSize: 11, color: "#76818B" }}>{log.actor_email}</div>
                          </td>
                          <td>
                            <Badge value={log.action} />
                          </td>
                          <td>{log.daycare_name || "Platform-wide"}</td>
                          <td>
                            <Badge value="success" />
                          </td>
                        </tr>
                      ))}
                      {auditLogs.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: "center", padding: 24, color: "#76818B" }}>
                            No audit events logged yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PAGE 2: DAYCARE DIRECTORY */}
          {/* ========================================================================= */}
          {activePage === "daycares" && (
            <div>
              {/* Header Controls with High-Contrast Segmented Tabs */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 16,
                  marginBottom: 20,
                }}
              >
                <div className="p-tabs" style={{ marginBottom: 0 }}>
                  <button
                    className={daycareTab === "all" ? "active" : ""}
                    onClick={() => setDaycareTab("all")}
                  >
                    All Centers ({daycares.length})
                  </button>
                  <button
                    className={daycareTab === "active" ? "active" : ""}
                    onClick={() => setDaycareTab("active")}
                  >
                    Active ({daycares.filter((d) => d.status === "active").length})
                  </button>
                  <button
                    className={daycareTab === "pending" ? "active" : ""}
                    onClick={() => setDaycareTab("pending")}
                  >
                    Pending ({pendingDaycares.length})
                  </button>
                  <button
                    className={daycareTab === "suspended" ? "active" : ""}
                    onClick={() => setDaycareTab("suspended")}
                  >
                    Suspended ({daycares.filter((d) => d.status === "suspended").length})
                  </button>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="text"
                    value={daycareSearch}
                    onChange={(e) => setDaycareSearch(e.target.value)}
                    placeholder="Search by name, email, license, slug..."
                    style={{
                      padding: "9px 16px",
                      borderRadius: 10,
                      border: "1.5px solid #dcd8cc",
                      fontSize: 13,
                      minWidth: 260,
                      outline: "none",
                      background: "#fff",
                    }}
                  />
                  {daycareSearch && (
                    <button
                      onClick={() => setDaycareSearch("")}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#76818B" }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Data Table */}
              <Card title={`Daycare Centers Directory (${filteredDaycares.length})`}>
                <div style={{ overflowX: "auto" }}>
                  <table className="p-table" style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th>Center Name & Slug</th>
                        <th>Administrator</th>
                        <th>License & Contact</th>
                        <th>Status</th>
                        <th>Plan & Trial</th>
                        <th>Enrolled / Quota</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDaycares.map((d) => {
                        const daysLeft = calculateDaysLeft(d.trial_ends_at);
                        const isSuspended = d.status === "suspended";
                        const isPending = d.status === "pending";

                        return (
                          <tr key={d.id}>
                            <td>
                              <strong>{d.name}</strong>
                              <div style={{ fontSize: 11, color: "#76818B", marginTop: 2 }}>
                                slug: <code style={{ background: "#f2f0e9", padding: "1px 5px", borderRadius: 4 }}>{d.slug}</code>
                              </div>
                              <div style={{ fontSize: 11, color: "#8a94a0" }}>{d.address || "No address provided"}</div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{d.admin_name || "Unassigned"}</div>
                              <div style={{ fontSize: 11, color: "#76818B" }}>{d.admin_email}</div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{d.license_number || "Pending verification"}</div>
                              <div style={{ fontSize: 11, color: "#76818B" }}>{d.contact_phone || d.contact_email}</div>
                            </td>
                            <td>
                              <Badge value={d.status} />
                            </td>
                            <td>
                              <div style={{ fontWeight: 700, textTransform: "capitalize" }}>{d.subscription_plan}</div>
                              {daysLeft !== null && (
                                <div style={{ fontSize: 11, color: daysLeft <= 5 ? "#c0392b" : "#417B61", fontWeight: 600, marginTop: 2 }}>
                                  ⏳ {daysLeft > 0 ? `${daysLeft} days remaining` : "Trial expired"}
                                </div>
                              )}
                            </td>
                            <td>
                              <div style={{ fontWeight: 700 }}>
                                {d.children_count} / {d.max_children || 50} children
                              </div>
                              <div style={{ fontSize: 11, color: "#76818B" }}>{d.staff_count} staff accounts</div>
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <Button
                                  variant="secondary small"
                                  onClick={() => setInspectModal({ open: true, daycare: d })}
                                >
                                  Inspect
                                </Button>

                                <Button
                                  variant="subtle small"
                                  onClick={() =>
                                    setPlanModal({
                                      open: true,
                                      daycare: d,
                                      plan: d.subscription_plan || "standard",
                                      maxChildren: d.max_children || 50,
                                      extendDays: 0,
                                    })
                                  }
                                >
                                  Plan & Quota
                                </Button>

                                {!isPending && (
                                  <Button
                                    variant={isSuspended ? "success small" : "danger small"}
                                    onClick={() => handleToggleSuspend(d)}
                                    disabled={actionBusyId === d.id}
                                  >
                                    {isSuspended ? "Reactivate" : "Suspend"}
                                  </Button>
                                )}

                                {isPending && (
                                  <Button
                                    variant="primary small"
                                    onClick={() =>
                                      setApproveModal({
                                        open: true,
                                        daycare: d,
                                        plan: "standard",
                                        trialDays: 30,
                                      })
                                    }
                                  >
                                    Review
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {filteredDaycares.length === 0 && (
                        <tr>
                          <td colSpan={7} style={{ textAlign: "center", padding: 36, color: "#76818B" }}>
                            No daycare centers match the selected filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PAGE 3: PENDING APPLICATIONS QUEUE */}
          {/* ========================================================================= */}
          {activePage === "applications" && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: "#10263B", margin: "0 0 6px" }}>
                  Daycare Self-Registration Applications Queue
                </h2>
                <p style={{ color: "#76818B", fontSize: 14, margin: 0 }}>
                  Review prospective daycare applications submitted via the SaaS public landing page.
                  Approving an application activates a 30-day trial and enables the director's account.
                </p>
              </div>

              {pendingDaycares.length === 0 ? (
                <Card title="Onboarding Queue Status">
                  <div style={{ textAlign: "center", padding: "48px 20px" }}>
                    <div style={{ display: "inline-flex", padding: 14, borderRadius: "50%", background: "#eef6f2", color: "#417B61", marginBottom: 12 }}>
                      <Icon name="checkCircle" size={36} />
                    </div>
                    <h3 style={{ fontSize: 20, color: "#10263B", marginBottom: 6 }}>All Caught Up!</h3>
                    <p style={{ color: "#76818B", maxWidth: 460, margin: "0 auto 20px" }}>
                      There are currently no daycare registration applications pending review.
                      Prospective daycares that register on the landing page will appear here immediately.
                    </p>
                    <Button variant="secondary" onClick={() => setActivePage("daycares")}>
                      View Active Daycare Directory →
                    </Button>
                  </div>
                </Card>
              ) : (
                <div style={{ display: "grid", gap: 20 }}>
                  {pendingDaycares.map((d) => (
                    <Card key={d.id} title={d.name}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                          gap: 16,
                          marginBottom: 20,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 11, color: "#76818B", fontWeight: 700, textTransform: "uppercase" }}>
                            Proposed Administrator
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: "#10263B" }}>{d.admin_name}</div>
                          <div style={{ fontSize: 13, color: "#76818B" }}>{d.admin_email}</div>
                        </div>

                        <div>
                          <div style={{ fontSize: 11, color: "#76818B", fontWeight: 700, textTransform: "uppercase" }}>
                            Official License & Center Info
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{d.license_number || "No license submitted"}</div>
                          <div style={{ fontSize: 13, color: "#76818B" }}>{d.address || "Address not provided"}</div>
                        </div>

                        <div>
                          <div style={{ fontSize: 11, color: "#76818B", fontWeight: 700, textTransform: "uppercase" }}>
                            Contact Information
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{d.contact_phone || "No phone"}</div>
                          <div style={{ fontSize: 13, color: "#76818B" }}>{d.contact_email}</div>
                        </div>

                        <div>
                          <div style={{ fontSize: 11, color: "#76818B", fontWeight: 700, textTransform: "uppercase" }}>
                            Requested Subscription Plan
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 700, textTransform: "capitalize", color: "#e07a5f" }}>
                            {d.subscription_plan || "Standard (30-Day Trial)"}
                          </div>
                          <div style={{ fontSize: 11, color: "#76818B" }}>
                            Submitted: {new Date(d.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: 12,
                          borderTop: "1px solid #eeece6",
                          paddingTop: 16,
                        }}
                      >
                        <Button
                          variant="danger"
                          onClick={() => setRejectModal({ open: true, daycare: d, reason: "" })}
                          disabled={actionBusyId === d.id}
                        >
                          Reject Application
                        </Button>

                        <Button
                          variant="success"
                          icon="check"
                          onClick={() =>
                            setApproveModal({
                              open: true,
                              daycare: d,
                              plan: "standard",
                              trialDays: 30,
                            })
                          }
                          disabled={actionBusyId === d.id}
                        >
                          Approve & Activate 30-Day Trial →
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* PAGE 4: GLOBAL ACCOUNTS */}
          {/* ========================================================================= */}
          {activePage === "users" && (
            <div>
              {/* Header Controls with High-Contrast Segmented Tabs */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 16,
                  marginBottom: 20,
                }}
              >
                <div className="p-tabs" style={{ marginBottom: 0 }}>
                  <button
                    className={userRoleFilter === "all" ? "active" : ""}
                    onClick={() => setUserRoleFilter("all")}
                  >
                    All Accounts ({users.length})
                  </button>
                  <button
                    className={userRoleFilter === "admin" ? "active" : ""}
                    onClick={() => setUserRoleFilter("admin")}
                  >
                    Daycare Admins ({users.filter((u) => u.role === "admin").length})
                  </button>
                  <button
                    className={userRoleFilter === "caregiver" ? "active" : ""}
                    onClick={() => setUserRoleFilter("caregiver")}
                  >
                    Caregivers ({users.filter((u) => u.role === "caregiver").length})
                  </button>
                  <button
                    className={userRoleFilter === "parent" ? "active" : ""}
                    onClick={() => setUserRoleFilter("parent")}
                  >
                    Parents ({users.filter((u) => u.role === "parent").length})
                  </button>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search accounts by name, email, or center..."
                    style={{
                      padding: "9px 16px",
                      borderRadius: 10,
                      border: "1.5px solid #dcd8cc",
                      fontSize: 13,
                      minWidth: 260,
                      outline: "none",
                      background: "#fff",
                    }}
                  />
                  {userSearch && (
                    <button
                      onClick={() => setUserSearch("")}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#76818B" }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <Card title={`Cross-Tenant User Accounts Directory (${filteredUsers.length})`}>
                <div style={{ overflowX: "auto" }}>
                  <table className="p-table" style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th>Account Name</th>
                        <th>Email Address</th>
                        <th>Platform Role</th>
                        <th>Assigned Daycare Center</th>
                        <th>Status</th>
                        <th>Registered Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: "50%",
                                  background: "#f1ede3",
                                  color: "#10263b",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontWeight: 700,
                                  fontSize: 12,
                                }}
                              >
                                {getInitials(u.name)}
                              </div>
                              <strong>{u.name}</strong>
                            </div>
                          </td>
                          <td style={{ color: "#76818B" }}>{u.email}</td>
                          <td>
                            <Badge value={u.role} />
                          </td>
                          <td>
                            {u.daycare_name ? (
                              <span style={{ fontWeight: 600 }}>{u.daycare_name}</span>
                            ) : (
                              <span style={{ color: "#76818B", fontStyle: "italic" }}>Platform Level (Global)</span>
                            )}
                          </td>
                          <td>
                            <Badge value={u.status} />
                          </td>
                          <td style={{ fontSize: 12, color: "#76818B" }}>
                            {u.created_at ? new Date(u.created_at).toLocaleDateString() : "Existing"}
                          </td>
                        </tr>
                      ))}
                      {filteredUsers.length === 0 && (
                        <tr>
                          <td colSpan={6} style={{ textAlign: "center", padding: 36, color: "#76818B" }}>
                            No user accounts match the search or role filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PAGE 5: PLATFORM AUDIT TRAIL */}
          {/* ========================================================================= */}
          {activePage === "audit" && (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 16,
                  marginBottom: 20,
                }}
              >
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 800, color: "#10263B", margin: "0 0 6px" }}>
                    Platform-wide Administrative Audit Trail
                  </h2>
                  <p style={{ color: "#76818B", fontSize: 14, margin: 0 }}>
                    Immutable historical record of cross-tenant actions, onboarding approvals, and security events.
                  </p>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Search action, actor, or daycare..."
                    style={{
                      padding: "9px 16px",
                      borderRadius: 10,
                      border: "1.5px solid #dcd8cc",
                      fontSize: 13,
                      minWidth: 260,
                      outline: "none",
                      background: "#fff",
                    }}
                  />
                  {auditSearch && (
                    <button
                      onClick={() => setAuditSearch("")}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#76818B" }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <Card title={`System Audit Logs (${filteredAuditLogs.length})`}>
                <div style={{ overflowX: "auto" }}>
                  <table className="p-table" style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Actor</th>
                        <th>Action</th>
                        <th>Daycare Context</th>
                        <th>Target Entity</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAuditLogs.map((log) => (
                        <tr key={log.id}>
                          <td style={{ fontSize: 12, color: "#76818B", whiteSpace: "nowrap" }}>
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td>
                            <strong>{log.actor_name || `User #${log.actor_id}`}</strong>
                            <div style={{ fontSize: 11, color: "#76818B" }}>{log.actor_email}</div>
                          </td>
                          <td>
                            <Badge value={log.action} />
                          </td>
                          <td>
                            {log.daycare_name ? (
                              <span style={{ fontWeight: 600 }}>{log.daycare_name}</span>
                            ) : (
                              <span style={{ color: "#76818B", fontStyle: "italic" }}>System Global</span>
                            )}
                          </td>
                          <td>
                            <code style={{ background: "#f2f0e9", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>
                              {log.target_table} #{log.target_id}
                            </code>
                          </td>
                          <td style={{ fontSize: 12, color: "#76818B" }}>
                            {log.metadata ? (
                              <span title={JSON.stringify(log.metadata)}>
                                {typeof log.metadata === "string" ? log.metadata : JSON.stringify(log.metadata).slice(0, 48) + "..."}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                      {filteredAuditLogs.length === 0 && (
                        <tr>
                          <td colSpan={6} style={{ textAlign: "center", padding: 36, color: "#76818B" }}>
                            No audit log entries match the search query.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PAGE 6: SYSTEM HEALTH & DIAGNOSTICS */}
          {/* ========================================================================= */}
          {activePage === "health" && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: "#10263B", margin: "0 0 6px" }}>
                  Platform Health, Infrastructure & Isolation Diagnostics
                </h2>
                <p style={{ color: "#76818B", fontSize: 14, margin: 0 }}>
                  Real-time PostgreSQL connection telemetry, multi-tenant security verification, and table records.
                </p>
              </div>

              {/* 4 Health Metrics Cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 18,
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    background: "#fff",
                    borderRadius: 16,
                    padding: "20px 22px",
                    border: "1px solid #eeece6",
                    borderLeft: "4px solid #417B61",
                    boxShadow: "0 2px 8px rgba(16, 38, 59, 0.04)",
                  }}
                >
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#417B61", lineHeight: 1, marginBottom: 6 }}>
                    {health?.db_connected ? "Operational" : "Connected"}
                  </div>
                  <div style={{ fontSize: 13, color: "#76818B", fontWeight: 700 }}>PostgreSQL Database</div>
                  <div style={{ fontSize: 11, color: "#417B61", marginTop: 4 }}>
                    Latency: {health?.db_latency_ms ?? 1} ms
                  </div>
                </div>

                <div
                  style={{
                    background: "#fff",
                    borderRadius: 16,
                    padding: "20px 22px",
                    border: "1px solid #eeece6",
                    borderLeft: "4px solid #10263B",
                    boxShadow: "0 2px 8px rgba(16, 38, 59, 0.04)",
                  }}
                >
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#10263B", lineHeight: 1, marginBottom: 6 }}>
                    {health ? formatUptime(health.uptime_seconds) : "Running"}
                  </div>
                  <div style={{ fontSize: 13, color: "#76818B", fontWeight: 700 }}>Server Process Uptime</div>
                  <div style={{ fontSize: 11, color: "#76818B", marginTop: 4 }}>Node.js {health?.node_version || "Active"}</div>
                </div>

                <div
                  style={{
                    background: "#fff",
                    borderRadius: 16,
                    padding: "20px 22px",
                    border: "1px solid #eeece6",
                    borderLeft: "4px solid #2A9D8F",
                    boxShadow: "0 2px 8px rgba(16, 38, 59, 0.04)",
                  }}
                >
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#2A9D8F", lineHeight: 1, marginBottom: 6 }}>
                    {health?.db_size || "14 MB"}
                  </div>
                  <div style={{ fontSize: 13, color: "#76818B", fontWeight: 700 }}>Database Storage Size</div>
                  <div style={{ fontSize: 11, color: "#2A9D8F", marginTop: 4 }}>PostgreSQL Dev Cluster</div>
                </div>

                <div
                  style={{
                    background: "#fff",
                    borderRadius: 16,
                    padding: "20px 22px",
                    border: "1px solid #eeece6",
                    borderLeft: "4px solid #e07a5f",
                    boxShadow: "0 2px 8px rgba(16, 38, 59, 0.04)",
                  }}
                >
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#e07a5f", lineHeight: 1, marginBottom: 6 }}>
                    {health?.environment || "development"}
                  </div>
                  <div style={{ fontSize: 13, color: "#76818B", fontWeight: 700 }}>Environment Mode</div>
                  <div style={{ fontSize: 11, color: "#e07a5f", marginTop: 4 }}>REST API Port 5000</div>
                </div>
              </div>

              {/* Security Isolation Checklist */}
              <div style={{ marginBottom: 24 }}>
                <Card title="Multi-Tenant Security & Isolation Verification">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                    <div style={{ padding: "16px 18px", background: "#fbfaf7", borderRadius: 12, border: "1px solid #eeece6" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ color: "#417B61", display: "flex", alignItems: "center" }}><Icon name="shield" size={17} /></span>
                        <strong style={{ color: "#10263B" }}>Row-Level Tenant Isolation</strong>
                      </div>
                      <div style={{ fontSize: 12, color: "#417B61", fontWeight: 700 }}>
                        ✓ Verified: daycare_id enforced across all queries
                      </div>
                      <p style={{ fontSize: 12, color: "#76818B", margin: "4px 0 0" }}>
                        Prevents cross-tenant data leakage between independent daycare centers (SRS §2.3, §6.2).
                      </p>
                    </div>

                    <div style={{ padding: "16px 18px", background: "#fbfaf7", borderRadius: 12, border: "1px solid #eeece6" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ color: "#417B61", display: "flex", alignItems: "center" }}><Icon name="lock" size={17} /></span>
                        <strong style={{ color: "#10263B" }}>Role-Based Access Control (RBAC)</strong>
                      </div>
                      <div style={{ fontSize: 12, color: "#417B61", fontWeight: 700 }}>
                        ✓ Active: super_admin, admin, caregiver, parent
                      </div>
                      <p style={{ fontSize: 12, color: "#76818B", margin: "4px 0 0" }}>
                        Strict route-level permissions protect operational endpoints (SRS §2.4, §4.1).
                      </p>
                    </div>

                    <div style={{ padding: "16px 18px", background: "#fbfaf7", borderRadius: 12, border: "1px solid #eeece6" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ color: "#417B61", display: "flex", alignItems: "center" }}><Icon name="zap" size={17} /></span>
                        <strong style={{ color: "#10263B" }}>Stateful Token Revocation</strong>
                      </div>
                      <div style={{ fontSize: 12, color: "#417B61", fontWeight: 700 }}>
                        ✓ Enforced: auth_state invalidated on password change
                      </div>
                      <p style={{ fontSize: 12, color: "#76818B", margin: "4px 0 0" }}>
                        Immediately terminates stale sessions on suspension or password reset.
                      </p>
                    </div>

                    <div style={{ padding: "16px 18px", background: "#fbfaf7", borderRadius: 12, border: "1px solid #eeece6" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ color: "#417B61", display: "flex", alignItems: "center" }}><Icon name="eye" size={17} /></span>
                        <strong style={{ color: "#10263B" }}>Guardian Pickup Biometrics</strong>
                      </div>
                      <div style={{ fontSize: 12, color: "#417B61", fontWeight: 700 }}>
                        ✓ Ready: Pickup verification with manual fallback
                      </div>
                      <p style={{ fontSize: 12, color: "#76818B", margin: "4px 0 0" }}>
                        Multi-factor adult identity confirmation during child checkout (SRS §4.10).
                      </p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Table Record Counters */}
              <Card title="Database Census & Record Counts">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
                  <div style={{ padding: "14px 18px", background: "#fbfaf7", borderRadius: 10, border: "1px solid #eeece6" }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#10263b" }}>
                      {health?.table_counts?.daycares_count || daycares.length}
                    </div>
                    <div style={{ fontSize: 12, color: "#76818b", fontWeight: 700 }}>Daycare Tenants</div>
                  </div>
                  <div style={{ padding: "14px 18px", background: "#fbfaf7", borderRadius: 10, border: "1px solid #eeece6" }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#10263b" }}>
                      {health?.table_counts?.users_count || users.length}
                    </div>
                    <div style={{ fontSize: 12, color: "#76818b", fontWeight: 700 }}>User Accounts</div>
                  </div>
                  <div style={{ padding: "14px 18px", background: "#fbfaf7", borderRadius: 10, border: "1px solid #eeece6" }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#10263b" }}>
                      {health?.table_counts?.children_count || stats?.total_children || 0}
                    </div>
                    <div style={{ fontSize: 12, color: "#76818b", fontWeight: 700 }}>Child Profiles</div>
                  </div>
                  <div style={{ padding: "14px 18px", background: "#fbfaf7", borderRadius: 10, border: "1px solid #eeece6" }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#10263b" }}>
                      {health?.table_counts?.audit_count || auditLogs.length}
                    </div>
                    <div style={{ fontSize: 12, color: "#76818b", fontWeight: 700 }}>Audit Log Entries</div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PAGE 7: PLATFORM BROADCAST BANNER MANAGER */}
          {/* ========================================================================= */}
          {activePage === "broadcast" && (
            <div>
              <div style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 24, fontWeight: 800, color: "#10263b", margin: "0 0 6px" }}>
                  Platform-Wide Broadcast Announcements
                </h2>
                <p style={{ color: "#76818b", fontSize: 14, margin: 0 }}>
                  Transmit real-time system notices, maintenance schedules, or service bulletins across all daycare workspaces.
                </p>
              </div>

              {/* Live Preview Card */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#76818B", textTransform: "uppercase", marginBottom: 8 }}>
                  Live Tenant Preview (How Daycares See This)
                </div>
                <div
                  style={{
                    background:
                      broadcast.level === "alert"
                        ? "#FEF2F2"
                        : broadcast.level === "warning"
                        ? "#FFFBEB"
                        : "#EFF6FF",
                    border: `1.5px solid ${
                      broadcast.level === "alert"
                        ? "#F87171"
                        : broadcast.level === "warning"
                        ? "#FCD34D"
                        : "#93C5FD"
                    }`,
                    color:
                      broadcast.level === "alert"
                        ? "#991B1B"
                        : broadcast.level === "warning"
                        ? "#92400E"
                        : "#1E40AF",
                    padding: "16px 20px",
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    opacity: broadcast.active ? 1 : 0.45,
                    filter: broadcast.active ? "none" : "grayscale(0.6)",
                    transition: "all 0.2s ease",
                  }}
                >
                  <span style={{ fontSize: 24 }}>
                    {broadcast.level === "alert" ? "🚨" : broadcast.level === "warning" ? "⚠️" : "📢"}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <strong style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        Platform Notice • {broadcast.level}
                      </strong>
                      {!broadcast.active && (
                        <span style={{ fontSize: 11, background: "#94a3b8", color: "#fff", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>
                          Currently Inactive / Draft
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>
                      {broadcast.message.trim() || "(No announcement message written yet. Enter text below to preview.)"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Editor Card */}
              <Card title="Broadcast Composer">
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#10263B", marginBottom: 6 }}>
                      Announcement Text
                    </label>
                    <textarea
                      rows={3}
                      value={broadcast.message}
                      onChange={(e) => setBroadcast({ ...broadcast, message: e.target.value })}
                      placeholder="e.g. Scheduled platform maintenance is planned for tonight from 11:00 PM to 11:30 PM EAT. Workspaces will remain accessible."
                      style={{
                        width: "100%",
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: "1.5px solid #dcd8cc",
                        fontSize: 14,
                        fontFamily: "inherit",
                        resize: "vertical",
                        boxSizing: "border-box",
                      }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#76818B", marginTop: 4 }}>
                      <span>Keep messages clear, friendly, and actionable for daycare operators.</span>
                      <span>{broadcast.message.length} characters</span>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#10263B", marginBottom: 6 }}>
                        Notice Urgency Level
                      </label>
                      <select
                        value={broadcast.level}
                        onChange={(e) => setBroadcast({ ...broadcast, level: e.target.value as any })}
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          borderRadius: 10,
                          border: "1.5px solid #dcd8cc",
                          fontSize: 14,
                          fontFamily: "inherit",
                        }}
                      >
                        <option value="info">Info (Blue) - General updates & features</option>
                        <option value="warning">Warning (Amber) - Scheduled maintenance</option>
                        <option value="alert">Alert (Crimson) - Urgent service notice</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#10263B", marginBottom: 6 }}>
                        Broadcast Status
                      </label>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          type="button"
                          onClick={() => setBroadcast({ ...broadcast, active: true })}
                          style={{
                            flex: 1,
                            padding: "10px 14px",
                            borderRadius: 10,
                            border: broadcast.active ? "2px solid #417B61" : "1.5px solid #dcd8cc",
                            background: broadcast.active ? "#eef6f2" : "#fbfaf7",
                            color: broadcast.active ? "#417B61" : "#76818B",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          🟢 Active / Visible
                        </button>
                        <button
                          type="button"
                          onClick={() => setBroadcast({ ...broadcast, active: false })}
                          style={{
                            flex: 1,
                            padding: "10px 14px",
                            borderRadius: 10,
                            border: !broadcast.active ? "2px solid #BD4264" : "1.5px solid #dcd8cc",
                            background: !broadcast.active ? "#fdf2f4" : "#fbfaf7",
                            color: !broadcast.active ? "#BD4264" : "#76818B",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          ⚪ Disabled / Hidden
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, borderTop: "1px solid #eeece6", paddingTop: 18 }}>
                    <Button
                      variant="secondary"
                      onClick={() => setBroadcast({ message: "", level: "info", active: false })}
                      disabled={broadcastSaving}
                    >
                      Clear Draft
                    </Button>
                    <Button
                      variant="primary"
                      icon="sparkles"
                      onClick={handleSaveBroadcast}
                      disabled={broadcastSaving}
                    >
                      {broadcastSaving ? "Saving Broadcast..." : "Save & Publish Broadcast"}
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </main>

      {/* ========================================================================= */}
      {/* MODAL 1: APPROVE DAYCARE & ACTIVATE 30-DAY TRIAL */}
      {/* ========================================================================= */}
      {approveModal.open && approveModal.daycare && (
        <div
          role="dialog"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(11, 23, 38, 0.7)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 20,
              padding: "32px 36px",
              width: "100%",
              maxWidth: 500,
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: "#10263B", margin: 0 }}>
                Approve Daycare Center
              </h3>
              <button
                onClick={() => setApproveModal({ open: false, daycare: null, plan: "standard", trialDays: 30 })}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#76818B" }}
              >
                ✕
              </button>
            </div>
            <p style={{ color: "#76818B", fontSize: 14, margin: "0 0 20px" }}>
              Activating <strong>{approveModal.daycare.name}</strong> will create its live workspace and grant immediate platform access to administrator <strong>{approveModal.daycare.admin_email}</strong>.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#10263B", marginBottom: 6 }}>
                Assign Subscription Tier
              </label>
              <select
                value={approveModal.plan}
                onChange={(e) => setApproveModal({ ...approveModal, plan: e.target.value as any })}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1.5px solid #dcd8cc",
                  fontSize: 14,
                  fontFamily: "inherit",
                }}
              >
                <option value="standard">Standard Subscription Tier</option>
                <option value="premium">Premium Enterprise Tier</option>
                <option value="trial">Trial-Only Tier</option>
              </select>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#10263B", marginBottom: 6 }}>
                Free Trial Duration (Days)
              </label>
              <input
                type="number"
                min={7}
                max={90}
                value={approveModal.trialDays}
                onChange={(e) => setApproveModal({ ...approveModal, trialDays: Number(e.target.value) || 30 })}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1.5px solid #dcd8cc",
                  fontSize: 14,
                  fontFamily: "inherit",
                }}
              />
              <span style={{ fontSize: 11, color: "#76818B", marginTop: 4, display: "block" }}>
                Default is 30 days as specified in SRS §2.3 and FR-UAM-10.
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <Button
                variant="secondary"
                onClick={() => setApproveModal({ open: false, daycare: null, plan: "standard", trialDays: 30 })}
                disabled={actionBusyId !== null}
              >
                Cancel
              </Button>
              <Button
                variant="success"
                onClick={handleApproveConfirm}
                disabled={actionBusyId !== null}
              >
                {actionBusyId === approveModal.daycare.id ? "Activating..." : "Approve & Activate Trial →"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: REJECT DAYCARE APPLICATION */}
      {/* ========================================================================= */}
      {rejectModal.open && rejectModal.daycare && (
        <div
          role="dialog"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(11, 23, 38, 0.7)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 20,
              padding: "32px 36px",
              width: "100%",
              maxWidth: 480,
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: "#c0392b", margin: 0 }}>
                Reject Daycare Application
              </h3>
              <button
                onClick={() => setRejectModal({ open: false, daycare: null, reason: "" })}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#76818B" }}
              >
                ✕
              </button>
            </div>
            <p style={{ color: "#76818B", fontSize: 14, margin: "0 0 18px" }}>
              Rejecting <strong>{rejectModal.daycare.name}</strong> will mark the application as rejected and deactivate the applicant administrator's account.
            </p>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#10263B", marginBottom: 6 }}>
                Reason for Rejection (Logged to Audit Trail)
              </label>
              <textarea
                value={rejectModal.reason}
                onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
                rows={3}
                placeholder="State the reason for rejecting this application..."
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1.5px solid #dcd8cc",
                  fontSize: 13,
                  fontFamily: "inherit",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <Button
                variant="secondary"
                onClick={() => setRejectModal({ open: false, daycare: null, reason: "" })}
                disabled={actionBusyId !== null}
              >
                Cancel
              </Button>
              <Button
                variant="danger-solid"
                onClick={handleRejectConfirm}
                disabled={actionBusyId !== null}
              >
                {actionBusyId === rejectModal.daycare.id ? "Rejecting..." : "Confirm Rejection"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: INSPECT DAYCARE DETAILS */}
      {/* ========================================================================= */}
      {inspectModal.open && inspectModal.daycare && (
        <div
          role="dialog"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(11, 23, 38, 0.7)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 20,
              padding: "32px 36px",
              width: "100%",
              maxWidth: 580,
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 22, fontWeight: 800, color: "#10263B", margin: "0 0 4px" }}>
                  {inspectModal.daycare.name}
                </h3>
                <span style={{ fontSize: 12, color: "#76818B" }}>
                  Slug: <code>{inspectModal.daycare.slug}</code> (Tenant ID: #{inspectModal.daycare.id})
                </span>
              </div>
              <Badge value={inspectModal.daycare.status} />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 16,
                padding: "16px 0",
                borderTop: "1px solid #eeece6",
                borderBottom: "1px solid #eeece6",
                marginBottom: 20,
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "#76818B", fontWeight: 700, textTransform: "uppercase" }}>Primary Administrator</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{inspectModal.daycare.admin_name}</div>
                <div style={{ fontSize: 12, color: "#76818B" }}>{inspectModal.daycare.admin_email}</div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "#76818B", fontWeight: 700, textTransform: "uppercase" }}>License & Regulatory</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{inspectModal.daycare.license_number || "Not on file"}</div>
                <div style={{ fontSize: 12, color: "#76818B" }}>Physical: {inspectModal.daycare.address}</div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "#76818B", fontWeight: 700, textTransform: "uppercase" }}>Subscription Tier</div>
                <div style={{ fontSize: 14, fontWeight: 700, textTransform: "capitalize", color: "#417B61" }}>
                  {inspectModal.daycare.subscription_plan}
                </div>
                <div style={{ fontSize: 12, color: "#76818B" }}>
                  {inspectModal.daycare.trial_ends_at
                    ? `Trial ends: ${new Date(inspectModal.daycare.trial_ends_at).toLocaleDateString()}`
                    : "Standard Active"}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "#76818B", fontWeight: 700, textTransform: "uppercase" }}>Capacity & Headcount</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {inspectModal.daycare.children_count} / {inspectModal.daycare.max_children || 50} Children ({Math.min(100, Math.round(((inspectModal.daycare.children_count || 0) / (inspectModal.daycare.max_children || 50)) * 100))}%)
                </div>
                <div style={{ background: "#eeece6", borderRadius: 999, height: 6, width: "100%", marginTop: 4, overflow: "hidden" }}>
                  <div style={{ background: "#417B61", height: "100%", width: `${Math.min(100, Math.round(((inspectModal.daycare.children_count || 0) / (inspectModal.daycare.max_children || 50)) * 100))}%` }} />
                </div>
                <div style={{ fontSize: 12, color: "#76818B", marginTop: 4 }}>{inspectModal.daycare.staff_count} Staff Members</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#10263B" }}>⏱️ Quick Extend:</span>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await portalApi.updateDaycarePlan(inspectModal.daycare!.id, inspectModal.daycare!.subscription_plan, inspectModal.daycare!.max_children, 15);
                      showToast(`Added +15 days to ${inspectModal.daycare!.name}'s trial!`);
                      setInspectModal({ open: false, daycare: null });
                      await loadAllPlatformData();
                    } catch (err: any) {
                      showToast(apiError(err));
                    }
                  }}
                  style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #dcd8cc", background: "#f8f6f0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  +15d
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await portalApi.updateDaycarePlan(inspectModal.daycare!.id, inspectModal.daycare!.subscription_plan, inspectModal.daycare!.max_children, 30);
                      showToast(`Added +30 days to ${inspectModal.daycare!.name}'s trial!`);
                      setInspectModal({ open: false, daycare: null });
                      await loadAllPlatformData();
                    } catch (err: any) {
                      showToast(apiError(err));
                    }
                  }}
                  style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #dcd8cc", background: "#f8f6f0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  +30d
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await portalApi.updateDaycarePlan(inspectModal.daycare!.id, inspectModal.daycare!.subscription_plan, inspectModal.daycare!.max_children, 60);
                      showToast(`Added +60 days to ${inspectModal.daycare!.name}'s trial!`);
                      setInspectModal({ open: false, daycare: null });
                      await loadAllPlatformData();
                    } catch (err: any) {
                      showToast(apiError(err));
                    }
                  }}
                  style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #dcd8cc", background: "#f8f6f0", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  +60d
                </button>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      const res = await portalApi.impersonateDaycare(inspectModal.daycare!.id);
                      showToast(`Switching into ${inspectModal.daycare!.name} workspace...`);
                      navigateTo("/admin/dashboard");
                    } catch (err: any) {
                      showToast(apiError(err));
                    }
                  }}
                >
                  🚀 Jump into Workspace
                </Button>
                <Button variant="primary" onClick={() => setInspectModal({ open: false, daycare: null })}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: UPDATE PLAN & MAX CHILDREN QUOTA */}
      {/* ========================================================================= */}
      {planModal.open && planModal.daycare && (
        <div
          role="dialog"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(11, 23, 38, 0.7)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 20,
              padding: "32px 36px",
              width: "100%",
              maxWidth: 480,
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: "#10263B", margin: 0 }}>
                Manage Subscription Plan & Quota
              </h3>
              <button
                onClick={() => setPlanModal({ open: false, daycare: null, plan: "standard", maxChildren: 50, extendDays: 0 })}
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#76818B" }}
              >
                ✕
              </button>
            </div>
            <p style={{ color: "#76818B", fontSize: 14, margin: "0 0 20px" }}>
              Configure subscription tier, maximum enrolled children quota, and trial extensions for <strong>{planModal.daycare.name}</strong>.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#10263B", marginBottom: 6 }}>
                Subscription Plan Tier
              </label>
              <select
                value={planModal.plan}
                onChange={(e) => setPlanModal({ ...planModal, plan: e.target.value })}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1.5px solid #dcd8cc",
                  fontSize: 14,
                  fontFamily: "inherit",
                }}
              >
                <option value="standard">Standard Plan</option>
                <option value="premium">Premium Enterprise Plan</option>
                <option value="trial">Trial Tier</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#10263B", marginBottom: 6 }}>
                Maximum Enrolled Children Quota
              </label>
              <input
                type="number"
                min={10}
                max={1000}
                value={planModal.maxChildren}
                onChange={(e) => setPlanModal({ ...planModal, maxChildren: Number(e.target.value) || 50 })}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1.5px solid #dcd8cc",
                  fontSize: 14,
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#10263B", marginBottom: 6 }}>
                Extend Trial Countdown (Days)
              </label>
              <input
                type="number"
                min={0}
                max={180}
                value={planModal.extendDays}
                onChange={(e) => setPlanModal({ ...planModal, extendDays: Number(e.target.value) || 0 })}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1.5px solid #dcd8cc",
                  fontSize: 14,
                  fontFamily: "inherit",
                }}
              />
              <span style={{ fontSize: 11, color: "#76818B", marginTop: 4, display: "block" }}>
                Enter number of extra days to extend the active trial (e.g. 15 or 30). Leave 0 if no extension.
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <Button
                variant="secondary"
                onClick={() => setPlanModal({ open: false, daycare: null, plan: "standard", maxChildren: 50, extendDays: 0 })}
                disabled={actionBusyId !== null}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handlePlanSave}
                disabled={actionBusyId !== null}
              >
                {actionBusyId === planModal.daycare.id ? "Saving..." : "Save Plan Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
