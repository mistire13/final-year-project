import React, { useState } from "react";
import "./saas.css";
import { portalApi, apiError } from "./api";
import { Icon } from "./ui.web";

const logo = require("../../design/figma-exports/ankelba-symbol.png");

interface RegisterFormState {
  daycareName: string;
  licenseNumber: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  requestedPlan: "trial" | "standard" | "premium";
}

const initialForm: RegisterFormState = {
  daycareName: "",
  licenseNumber: "",
  contactEmail: "",
  contactPhone: "",
  address: "",
  adminName: "",
  adminEmail: "",
  adminPassword: "",
  requestedPlan: "standard",
};

export default function LandingPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<RegisterFormState>(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<any | null>(null);

  const navigateTo = (path: string) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const openRegisterModal = (plan: "trial" | "standard" | "premium" = "standard") => {
    setForm((prev) => ({ ...prev, requestedPlan: plan }));
    setError(null);
    setSuccessResult(null);
    setModalOpen(true);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await portalApi.registerDaycare(form);
      setSuccessResult(res.daycare);
    } catch (err: any) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="saas-landing">
      {/* Sticky Navigation */}
      <header className="saas-nav">
        <a className="saas-brand" onClick={() => navigateTo("/")}>
          <img src={logo} alt="Ankelba Logo" />
          <div>
            <div className="saas-brand-title">Ankelba</div>
            <div className="saas-brand-tag">Daycare SaaS Ecosystem</div>
          </div>
        </a>

        <div className="saas-nav-links">
          <a className="saas-nav-link" href="#features">Features</a>
          <a className="saas-nav-link" href="#plans">30-Day Trial</a>
          <a className="saas-nav-link" href="#security">Tenant Isolation</a>
          <a className="saas-nav-link" onClick={() => navigateTo("/app")}>Parent Mobile App</a>
        </div>

        <div className="saas-nav-actions">
          <button className="saas-btn saas-btn-outline" onClick={() => navigateTo("/admin")}>
            Daycare Login
          </button>
          <button className="saas-btn saas-btn-primary" onClick={() => openRegisterModal("standard")}>
            Start Free Trial
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="saas-hero">
        <div className="saas-badge-pill">
          <Icon name="sparkles" size={14} />
          <span>Next-Generation Multi-Tenant Daycare SaaS Platform</span>
        </div>

        <h1>
          Modern Childcare Operations, <br />
          <span className="highlight">Connected Families</span> & Complete Peace of Mind
        </h1>

        <p className="subtitle">
          Ankelba delivers an all-in-one cloud workspace for daycare operators and parents. 
          Manage real-time attendance, biometric guardian verification, daily developmental milestones, 
          AI parenting guidance, and billing with strict data isolation for every center.
        </p>

        <div className="saas-hero-actions">
          <button className="saas-btn saas-btn-accent" style={{ padding: "14px 32px", fontSize: "16px", display: "inline-flex", alignItems: "center", gap: 8 }} onClick={() => openRegisterModal("standard")}>
            <Icon name="rocket" size={17} /> Register Daycare (30-Day Free Trial)
          </button>
          <button className="saas-btn saas-btn-primary" style={{ padding: "14px 28px", fontSize: "15px", display: "inline-flex", alignItems: "center", gap: 8 }} onClick={() => navigateTo("/admin")}>
            <Icon name="building" size={16} /> Daycare Admin Portal
          </button>
          <button className="saas-btn saas-btn-outline" style={{ padding: "14px 24px", fontSize: "15px", display: "inline-flex", alignItems: "center", gap: 8 }} onClick={() => navigateTo("/app")}>
            <Icon name="smartphone" size={16} /> Open Parent Mobile View
          </button>
        </div>

        <div className="saas-trust-row">
          <div className="saas-trust-item">
            <Icon name="shield" size={16} />
            <span>Row-Level Tenant Isolation</span>
          </div>
          <div className="saas-trust-item">
            <Icon name="zap" size={16} />
            <span>Instant 30-Day Mock Trial</span>
          </div>
          <div className="saas-trust-item">
            <Icon name="bot" size={16} />
            <span>24/7 AI Parent Guide</span>
          </div>
          <div className="saas-trust-item">
            <Icon name="eye" size={16} />
            <span>Biometric Guardian Pickup</span>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="saas-section">
        <div className="saas-section-header">
          <span className="saas-section-tag">Core Modules</span>
          <h2 className="saas-section-title">Everything Your Daycare Center Needs</h2>
          <p className="saas-section-desc">
            Designed specifically to eliminate paperwork, streamline daily workflows, and build deep trust between caregivers and parents.
          </p>
        </div>

        <div className="saas-feature-grid">
          <div className="saas-feature-card">
            <div className="saas-card-icon saas-icon-green"><Icon name="edit" size={24} /></div>
            <h3>Daily Activity & Milestones</h3>
            <p>
              Log meals, nap intervals, diaper & potty changes, learning moods, and photos in real time. Parents receive structured updates right in their mobile feed.
            </p>
          </div>

          <div className="saas-feature-card">
            <div className="saas-card-icon saas-icon-coral"><Icon name="shield" size={24} /></div>
            <h3>Biometric Guardian Pickup</h3>
            <p>
              Prevent unauthorized child collection with automated biometric validation. Enrolled parents and guardians verify their identity before checkout.
            </p>
          </div>

          <div className="saas-feature-card">
            <div className="saas-card-icon saas-icon-amber"><Icon name="bot" size={24} /></div>
            <h3>AI Parent Guide</h3>
            <p>
              An intelligent, evidence-based pediatric wellness assistant available 24/7 for parents to consult on child routines, sleep training, and nutrition.
            </p>
          </div>

          <div className="saas-feature-card">
            <div className="saas-card-icon saas-icon-green"><Icon name="clipboard" size={24} /></div>
            <h3>Front Desk & Roster Duties</h3>
            <p>
              Organize caregiver classroom assignments, shift duties, emergency broadcast alerts, and central attendance tracking with a single click.
            </p>
          </div>

          <div className="saas-feature-card">
            <div className="saas-card-icon saas-icon-coral"><Icon name="bag" size={24} /></div>
            <h3>Store & Supply Orders</h3>
            <p>
              In-app daycare commerce for uniforms, books, diapers, and event tickets. Flexible digital checkout via digital payment gateway or pay-at-daycare.
            </p>
          </div>

          <div id="security" className="saas-feature-card" style={{ scrollMarginTop: "100px" }}>
            <div className="saas-card-icon saas-icon-amber"><Icon name="lock" size={24} /></div>
            <h3>Multi-Tenant Cloud Security</h3>
            <p>
              Each registered daycare operates as an independent tenant. Super Admin governs approvals, subscriptions, and platform metrics with zero cross-tenant data crossover.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing / Trial Section */}
      <section id="plans" className="saas-section" style={{ background: "#f8f6ee", borderRadius: "32px", margin: "40px auto" }}>
        <div className="saas-section-header">
          <span className="saas-section-tag">Flexible Subscriptions</span>
          <h2 className="saas-section-title">Start with a 30-Day Free Trial</h2>
          <p className="saas-section-desc">
            No credit card required for onboarding. Explore the full suite, invite your staff, and experience stress-free daycare management.
          </p>
        </div>

        <div className="saas-pricing-grid">
          {/* Starter Plan */}
          <div className="saas-pricing-card">
            <h3 className="saas-plan-title">Starter Center</h3>
            <p className="saas-plan-desc">Perfect for emerging boutique daycares and home-based nurseries.</p>
            <div className="saas-plan-price">
              <span className="amount">Free</span>
              <span className="period"> / 30-Day Trial</span>
            </div>
            <ul className="saas-plan-features">
              <li><span className="saas-check-icon">✓</span> Up to 25 Children</li>
              <li><span className="saas-check-icon">✓</span> Daily Activity & Nap Reporting</li>
              <li><span className="saas-check-icon">✓</span> Attendance & Emergency Alerts</li>
              <li><span className="saas-check-icon">✓</span> Parent Mobile App Access</li>
              <li><span className="saas-check-icon">✓</span> Basic AI Parent Guide</li>
            </ul>
            <button className="saas-btn saas-btn-outline" onClick={() => openRegisterModal("trial")}>
              Select Starter Plan
            </button>
          </div>

          {/* Standard Plan (Featured) */}
          <div className="saas-pricing-card featured">
            <div className="saas-popular-tag">Most Popular</div>
            <h3 className="saas-plan-title">Standard Care</h3>
            <p className="saas-plan-desc">For established daycares looking to scale and modernize care.</p>
            <div className="saas-plan-price">
              <span className="amount">30 Days</span>
              <span className="period"> / Free Trial</span>
            </div>
            <ul className="saas-plan-features">
              <li><span className="saas-check-icon">✓</span> Up to 75 Children</li>
              <li><span className="saas-check-icon">✓</span> Biometric Guardian Verification</li>
              <li><span className="saas-check-icon">✓</span> Front-Desk Roster Management</li>
              <li><span className="saas-check-icon">✓</span> Daycare Store & In-App Orders</li>
              <li><span className="saas-check-icon">✓</span> Health & Incident Tracking</li>
              <li><span className="saas-check-icon">✓</span> Full AI Parent Assistant</li>
            </ul>
            <button className="saas-btn saas-btn-accent" onClick={() => openRegisterModal("standard")}>
              Start Standard Trial
            </button>
          </div>

          {/* Premium Plan */}
          <div className="saas-pricing-card">
            <h3 className="saas-plan-title">Enterprise Academy</h3>
            <p className="saas-plan-desc">Comprehensive operations for large childcare networks & campuses.</p>
            <div className="saas-plan-price">
              <span className="amount">Custom</span>
              <span className="period"> / 30-Day Trial</span>
            </div>
            <ul className="saas-plan-features">
              <li><span className="saas-check-icon">✓</span> Unlimited Children & Staff</li>
              <li><span className="saas-check-icon">✓</span> Multi-Classroom Dynamic Routing</li>
              <li><span className="saas-check-icon">✓</span> Priority Guardian Biometric Sync</li>
              <li><span className="saas-check-icon">✓</span> Audit Trail & Administrative Reports</li>
              <li><span className="saas-check-icon">✓</span> Dedicated Account Manager</li>
            </ul>
            <button className="saas-btn saas-btn-outline" onClick={() => openRegisterModal("premium")}>
              Select Enterprise Plan
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--line)", padding: "40px 48px", background: "var(--cream)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src={logo} alt="Ankelba" style={{ height: 32 }} />
            <span style={{ fontFamily: "Quicksand_700Bold", fontSize: 18 }}>Ankelba SaaS Platform</span>
          </div>
          <div style={{ display: "flex", gap: 24, fontSize: 13, color: "var(--muted)" }}>
            <a onClick={() => navigateTo("/admin")} style={{ cursor: "pointer" }}>Daycare Admin Login</a>
            <a onClick={() => navigateTo("/super-admin")} style={{ cursor: "pointer" }}>Super Admin Portal</a>
            <a onClick={() => navigateTo("/app")} style={{ cursor: "pointer" }}>Parent Mobile View</a>
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            © 2026 Ankelba Platform • Senior Project Defense Baseline
          </div>
        </div>
      </footer>

      {/* Daycare Self-Registration Modal */}
      {modalOpen && (
        <div className="saas-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="saas-modal-content">
            <button className="saas-modal-close" onClick={() => setModalOpen(false)}>✕</button>

            {successResult ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ display: "inline-flex", padding: 16, borderRadius: "50%", background: "#eef6f2", color: "#417B61", marginBottom: 16 }}>
                  <Icon name="checkCircle" size={44} />
                </div>
                <h2 style={{ fontFamily: "Quicksand_700Bold", fontSize: 26, color: "var(--navy)", marginBottom: 12 }}>
                  Application Submitted Successfully!
                </h2>
                <p style={{ color: "var(--muted)", fontSize: 15, lineHeight: 1.6, maxWidth: 500, margin: "0 auto 24px" }}>
                  Thank you for applying to join Ankelba, <strong>{successResult.name}</strong>! Your application is in review. 
                  Once approved by the Super Administrator, your 30-day trial will activate and you can log in directly.
                </p>
                <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
                  <button className="saas-btn saas-btn-primary" onClick={() => { setModalOpen(false); navigateTo("/super-admin"); }}>
                    Go to Super Admin (To Review)
                  </button>
                  <button className="saas-btn saas-btn-accent" onClick={() => { setModalOpen(false); navigateTo("/admin"); }}>
                    Daycare Login
                  </button>
                  <button className="saas-btn saas-btn-outline" onClick={() => setModalOpen(false)}>
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h2 style={{ fontFamily: "Quicksand_700Bold", fontSize: 24, color: "var(--navy)", margin: "0 0 6px" }}>
                  Register Your Daycare Center
                </h2>
                <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 24px" }}>
                  Fill in your center's information to initiate your 30-day mock trial.
                </p>

                {error && (
                  <div style={{ background: "#fdf3f0", color: "#c0392b", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="alert" size={16} /> <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleRegisterSubmit}>
                  <div className="saas-form-grid">
                    <div className="saas-form-group full">
                      <label className="saas-form-label">Daycare Center Name *</label>
                      <input
                        className="saas-form-input"
                        placeholder="e.g. Blossom Star Childcare"
                        value={form.daycareName}
                        onChange={(e) => setForm({ ...form, daycareName: e.target.value })}
                        required
                      />
                    </div>

                    <div className="saas-form-group">
                      <label className="saas-form-label">Official License Number</label>
                      <input
                        className="saas-form-input"
                        placeholder="e.g. ETH-DC-2026-442"
                        value={form.licenseNumber}
                        onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
                      />
                    </div>

                    <div className="saas-form-group">
                      <label className="saas-form-label">Subscription Plan</label>
                      <select
                        className="saas-form-select"
                        value={form.requestedPlan}
                        onChange={(e: any) => setForm({ ...form, requestedPlan: e.target.value })}
                      >
                        <option value="trial">Starter (30 Days Free)</option>
                        <option value="standard">Standard Care (30 Days Free)</option>
                        <option value="premium">Enterprise Academy (30 Days Free)</option>
                      </select>
                    </div>

                    <div className="saas-form-group">
                      <label className="saas-form-label">Center Contact Email *</label>
                      <input
                        type="email"
                        className="saas-form-input"
                        placeholder="info@daycare.com"
                        value={form.contactEmail}
                        onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                        required
                      />
                    </div>

                    <div className="saas-form-group">
                      <label className="saas-form-label">Center Contact Phone</label>
                      <input
                        className="saas-form-input"
                        placeholder="+251 91 123 4567"
                        value={form.contactPhone}
                        onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                      />
                    </div>

                    <div className="saas-form-group full">
                      <label className="saas-form-label">Physical Address / City</label>
                      <input
                        className="saas-form-input"
                        placeholder="Bole Sub-City, Addis Ababa, Ethiopia"
                        value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                      />
                    </div>

                    <div className="saas-form-group full" style={{ borderTop: "1px solid var(--line)", paddingTop: 16, marginTop: 8 }}>
                      <strong style={{ display: "block", fontSize: 15, color: "var(--navy)", marginBottom: 12 }}>
                        Primary Administrator Account
                      </strong>
                    </div>

                    <div className="saas-form-group full">
                      <label className="saas-form-label">Director / Administrator Full Name *</label>
                      <input
                        className="saas-form-input"
                        placeholder="e.g. Tigist Haile"
                        value={form.adminName}
                        onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                        required
                      />
                    </div>

                    <div className="saas-form-group">
                      <label className="saas-form-label">Admin Email *</label>
                      <input
                        type="email"
                        className="saas-form-input"
                        placeholder="director@daycare.com"
                        value={form.adminEmail}
                        onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                        required
                      />
                    </div>

                    <div className="saas-form-group">
                      <label className="saas-form-label">Admin Password *</label>
                      <input
                        type="password"
                        className="saas-form-input"
                        placeholder="Create a strong password"
                        value={form.adminPassword}
                        onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end", gap: 12 }}>
                    <button type="button" className="saas-btn saas-btn-ghost" onClick={() => setModalOpen(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="saas-btn saas-btn-accent" disabled={loading}>
                      {loading ? "Submitting Application..." : "Submit Application for Approval"}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
