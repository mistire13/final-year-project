import React, { useState } from "react";
import { portalApi, apiError } from "../portal/api";
import { dateLabel } from "../portal/subscriptions";
import { Button, Icon, Badge } from "../portal/ui.web";
import "./landing.css";

const logo = require("../../design/figma-exports/ankelba-symbol.png");

export default function ApplicationStatus() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResult(null);
    setBusy(true);
    try {
      const data = await portalApi.applicationStatus(email, password);
      setResult(data);
      setPassword("");
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const isApproved = result && (result.status === "active" || result.status === "approved");
  const isPending = result && result.status === "pending";
  const isRejected = result && result.status === "rejected";
  const isSuspended = result && result.status === "suspended";

  return (
    <div className="landing-container" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Navigation Header */}
      <header className="landing-nav">
        <a className="landing-brand" href="/" aria-label="Ankelba Home">
          <img src={logo} alt="Ankelba Logo" className="landing-brand-logo" />
          <div className="landing-brand-text">
            <strong>Ankelba</strong>
            <span>NURTURE • CONNECT • SAFEGUARD</span>
          </div>
        </a>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <Button variant="secondary" onClick={() => { window.location.href = "/"; }}>
            ← Return to Home
          </Button>
          <Button variant="primary" onClick={() => { window.location.href = "/admin/login"; }}>
            Staff Sign In
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: "620px", margin: "3.5rem auto", padding: "0 1.5rem", width: "100%", flex: 1 }}>
        <div className="status-card-box">
          <div style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="landing-badge">
              <Icon name="file" size={14} /> APPLICATION TRACKER
            </span>
          </div>

          <h1 style={{ fontSize: "1.85rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "var(--ankelba-navy)" }}>
            Check Daycare Application Status
          </h1>
          <p style={{ color: "var(--ankelba-muted)", fontSize: "0.95rem", marginBottom: "2rem" }}>
            Enter the director email address and password used when submitting your daycare registration application.
          </p>

          {error && (
            <div className="error-banner" role="alert" style={{ marginBottom: "1.5rem" }}>
              <Icon name="alert" size={18} />
              <span>{error}</span>
            </div>
          )}

          {!result ? (
            <form onSubmit={check}>
              <div className="form-group" style={{ marginBottom: "1.25rem" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 700, marginBottom: "6px", color: "var(--ankelba-navy)" }}>
                  Director Login Email Address
                </label>
                <input
                  type="email"
                  required
                  autoComplete="username"
                  placeholder="director@yourdaycare.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="landing-input"
                />
              </div>

              <div className="form-group" style={{ marginBottom: "1.75rem" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 700, marginBottom: "6px", color: "var(--ankelba-navy)" }}>
                  Password
                </label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="landing-input"
                />
              </div>

              <Button
                type="submit"
                disabled={busy}
                variant="primary"
                style={{ width: "100%", justifyContent: "center" }}
              >
                {busy ? "Checking Status…" : "Check Application Status →"}
              </Button>
            </form>
          ) : (
            <div style={{ textAlign: "center", paddingTop: "0.5rem" }}>
              {/* Status Icon */}
              <div style={{ marginBottom: "1.25rem" }}>
                {isApproved && (
                  <div style={{ display: "inline-flex", padding: "16px", borderRadius: "50%", background: "#EDF7ED", color: "#2E7D32" }}>
                    <Icon name="checkCircle" size={44} />
                  </div>
                )}
                {isPending && (
                  <div style={{ display: "inline-flex", padding: "16px", borderRadius: "50%", background: "#FEF7E6", color: "#B7791F" }}>
                    <Icon name="clock" size={44} />
                  </div>
                )}
                {isRejected && (
                  <div style={{ display: "inline-flex", padding: "16px", borderRadius: "50%", background: "#FDECEE", color: "#C2185B" }}>
                    <Icon name="alert" size={44} />
                  </div>
                )}
                {isSuspended && (
                  <div style={{ display: "inline-flex", padding: "16px", borderRadius: "50%", background: "#FDECEE", color: "#C2185B" }}>
                    <Icon name="lock" size={44} />
                  </div>
                )}
              </div>

              <h2 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "0 0 0.5rem 0", color: "var(--ankelba-navy)" }}>
                {result.daycare_name || result.name}
              </h2>

              <div style={{ marginBottom: "1.25rem" }}>
                {isApproved && <Badge value="approved" tone="green" />}
                {isPending && <Badge value="Under Review" tone="amber" />}
                {isRejected && <Badge value="rejected" tone="red" />}
                {isSuspended && <Badge value="suspended" tone="red" />}
              </div>

              {/* Status Message */}
              <div style={{ background: "#FAF8EF", borderRadius: "12px", border: "1px solid #EAE7DD", padding: "1.25rem", margin: "1rem 0 1.75rem", textAlign: "left" }}>
                <p style={{ margin: 0, fontSize: "0.95rem", color: "#374151", lineHeight: 1.6 }}>
                  {isApproved && (
                    <>
                      <strong>Congratulations!</strong> Your daycare application has been approved by the platform administration. Your daycare center workspace is now active, and you can sign in directly to set up classrooms, invite staff, and manage child records.
                    </>
                  )}
                  {isPending && (
                    <>
                      Your registration application has been submitted and is currently <strong>under review</strong> by the Ankelba Super Administrator. You will be able to sign in as soon as approval is completed.
                    </>
                  )}
                  {isRejected && (
                    <>
                      <strong>Application Not Approved:</strong>{" "}
                      {result.review_reason || "The submitted daycare details did not meet the platform onboarding requirements. Please contact support."}
                    </>
                  )}
                  {isSuspended && (
                    <>
                      This daycare center is currently suspended. Please contact Ankelba platform administration for assistance.
                    </>
                  )}
                </p>

                
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
                {isApproved && (
                  <Button
                    variant="primary"
                    onClick={() => { window.location.href = "/admin/login"; }}
                  >
                    Sign In to Daycare Workspace →
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => setResult(null)}
                >
                  Check Another Application
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer style={{ padding: "2rem", borderTop: "1px solid var(--ankelba-border)", textAlign: "center", color: "var(--ankelba-muted)", fontSize: "0.85rem" }}>
        © 2026 Ankelba Daycare Platform · HiLCoE Senior Project
      </footer>
    </div>
  );
}
