import React, { useState } from "react";
import "./landing.css";
import { portalApi, apiError } from "../portal/api";
import { Button, Icon, Badge } from "../portal/ui.web";

const logo = require("../../design/figma-exports/ankelba-symbol.png");

interface RegisterFormState {
  daycareName: string;
  citySubcity: string;
  contactEmail: string;
  contactPhone: string;
  licenseNumber: string;
  adminName: string;
  adminEmail: string;
  adminPhone: string;
  adminPassword: string;
}

const initialForm: RegisterFormState = {
  daycareName: "",
  citySubcity: "",
  contactEmail: "",
  contactPhone: "",
  licenseNumber: "",
  adminName: "",
  adminEmail: "",
  adminPhone: "",
  adminPassword: "",
};

export default function LandingPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<RegisterFormState>(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  const navigateTo = (path: string) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await portalApi.registerDaycare({
        daycareName: form.daycareName,
        licenseNumber: form.licenseNumber || "N/A",
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        address: form.citySubcity,
        adminName: form.adminName,
        adminEmail: form.adminEmail,
        adminPassword: form.adminPassword,
        requestedPlan: "standard",
        billingCycle: "monthly",
        termsVersion: 1,
      });

      setSubmittedSuccess(true);
      setForm(initialForm);
    } catch (err: any) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing-container">
      {/* ─── Navigation Header ─── */}
      <header className="landing-nav">
        <a className="landing-brand" href="/" aria-label="Ankelba Home">
          <img src={logo} alt="Ankelba Logo" className="landing-brand-logo" />
          <div className="landing-brand-text">
            <strong>Ankelba</strong>
            <span>NURTURE • CONNECT • SAFEGUARD</span>
          </div>
        </a>

        <nav className="landing-menu" aria-label="Main Navigation">
          <a href="#why-ankelba">Why Ankelba</a>
          <a href="#features">Features</a>
          <a href="#testimonials">Testimonials</a>
          <a href="/application-status">Check Status</a>
        </nav>

        <div className="landing-nav-actions">
          <Button
            variant="secondary"
            onClick={() => navigateTo("/app")}
          >
            Parent App
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigateTo("/admin/login")}
          >
            Staff Sign In
          </Button>
          <Button
            variant="primary"
            icon="arrow"
            onClick={() => {
              setError(null);
              setSubmittedSuccess(false);
              setModalOpen(true);
            }}
          >
            Register Daycare
          </Button>
        </div>
      </header>

      {/* ─── Hero Section ─── */}
      <section className="landing-hero">
        <div className="hero-content">
          <div className="landing-badge">
            <Icon name="leaf" size={15} />
            <span>Designed for Early Childhood Care Centers</span>
          </div>
          <h1 className="hero-title">
            The Modern Heartbeat of <span className="highlight">Daycare Excellence</span>
          </h1>
          <p className="hero-subtitle">
            Ankelba empowers daycare directors with organized child records and verified pickup security, while giving working parents real-time visibility into their child's daily care and developmental milestones.
          </p>
          <div className="hero-cta-group">
            <Button
              variant="primary"
              icon="arrow"
              onClick={() => {
                setError(null);
                setSubmittedSuccess(false);
                setModalOpen(true);
              }}
            >
              Get Started — Register Daycare
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                document.getElementById("why-ankelba")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              See How It Works
            </Button>
            <Button
              variant="outline"
              onClick={() => navigateTo("/application-status")}
            >
              Track Application Status
            </Button>
          </div>
        </div>

        <div className="hero-preview">
          <div className="hero-preview-card">
            <div className="hero-preview-header">
              <div className="daycare-avatar">
                <div className="daycare-avatar-circle">
                  <Icon name="building" size={20} />
                </div>
                <div>
                  <strong style={{ display: "block", fontSize: "0.95rem", color: "var(--ankelba-navy)" }}>Little Stars Daycare</strong>
                  <span style={{ fontSize: "0.8rem", color: "var(--ankelba-muted)" }}>Bole Subcity, Addis Ababa</span>
                </div>
              </div>
              <Badge value="Live Center" tone="green" />
            </div>

            <div className="preview-grid">
              <div className="preview-tile yellow">
                <span className="preview-tile-label">Today's Attendance</span>
                <span className="preview-tile-value">
                  <Icon name="check" size={15} /> 38 Present
                </span>
              </div>
              <div className="preview-tile purple">
                <span className="preview-tile-label">Daily Reports</span>
                <span className="preview-tile-value">
                  <Icon name="clipboard" size={15} /> 38 Completed
                </span>
              </div>
              <div className="preview-tile cyan">
                <span className="preview-tile-label">Care Groups</span>
                <span className="preview-tile-value">
                  <Icon name="leaf" size={15} /> 3 Classrooms
                </span>
              </div>
              <div className="preview-tile green">
                <span className="preview-tile-label">Pickup Status</span>
                <span className="preview-tile-value">
                  <Icon name="shield" size={15} /> Verified Safe
                </span>
              </div>
            </div>

            <div className="preview-pickup-alert">
              <div className="alert-icon">
                <Icon name="checkCircle" size={20} />
              </div>
              <div>
                <strong style={{ display: "block", color: "var(--ankelba-navy)", fontSize: "0.85rem" }}>
                  Guardian Verified & Released
                </strong>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--ankelba-muted)" }}>
                  Abebech T. (Mother) authorized pickup for Liya Dawit · 4:32 PM
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Why Ankelba Section (Comparison) ─── */}
      <section id="why-ankelba" className="landing-why">
        <div className="section-head">
          <div className="section-subtitle">The Ankelba Advantage</div>
          <h2 className="section-title">Why Daycares Are Leaving Paper Behind</h2>
          <p className="section-desc">
            Manual paper logs and phone calls cause lost attendance records, delayed incident reporting, and anxious parents. Ankelba brings clarity, safety, and operational excellence to your center.
          </p>
        </div>

        <div className="comparison-grid">
          {/* Traditional Card */}
          <div className="comparison-card traditional">
            <span className="comparison-badge">TRADITIONAL DAYCARE</span>
            <h3>Manual Paper & Memory</h3>
            <ul className="comparison-list">
              <li>
                <span className="icon-cross"><Icon name="close" size={15} /></span>
                <span>Paper sign-in binders that get lost, damaged, or filled out illegibly.</span>
              </li>
              <li>
                <span className="icon-cross"><Icon name="close" size={15} /></span>
                <span>Unverified pickups with no photo confirmation of authorized adult guardians.</span>
              </li>
              <li>
                <span className="icon-cross"><Icon name="close" size={15} /></span>
                <span>Awkward care fee collection with crumpled paper receipts and lost records.</span>
              </li>
              <li>
                <span className="icon-cross"><Icon name="close" size={15} /></span>
                <span>Parents constantly calling or worrying about meals, naps, and health during the day.</span>
              </li>
            </ul>
          </div>

          {/* Ankelba Card */}
          <div className="comparison-card ankelba">
            <span className="comparison-badge">ANKELBA PLATFORM</span>
            <h3>Organized, Secure & Real-Time</h3>
            <ul className="comparison-list">
              <li>
                <span className="icon-check"><Icon name="check" size={15} /></span>
                <span>Fast front-desk check-in and checkout with automatic time logs and timestamps.</span>
              </li>
              <li>
                <span className="icon-check"><Icon name="check" size={15} /></span>
                <span>Strict pickup verification matching guardian photos and identification cards.</span>
              </li>
              <li>
                <span className="icon-check"><Icon name="check" size={15} /></span>
                <span>Clear child care fee tracking, instant Telebirr/CBE payment reconciliation, and receipts.</span>
              </li>
              <li>
                <span className="icon-check"><Icon name="check" size={15} /></span>
                <span>Parents receive structured daily reports (meals, rest, activities) right on their mobile app.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ─── Core Features Showcase ─── */}
      <section id="features" className="landing-features">
        <div className="section-head">
          <div className="section-subtitle">Platform Capabilities</div>
          <h2 className="section-title">Everything Your Daycare Needs in One Place</h2>
          <p className="section-desc">
            Engineered around the operational workflows and safety standards of modern early childhood care centers.
          </p>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon-wrapper" style={{ background: "#EEF7EE", color: "#2E7D32" }}>
              <Icon name="shield" size={24} />
            </div>
            <h4>Verified Child Pickup Safety</h4>
            <p>
              Only authorized adults can collect a child. Staff verify guardian photo identification before releasing the child, with full audit logging.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-wrapper" style={{ background: "#FEF9EE", color: "#B7791F" }}>
              <Icon name="clipboard" size={24} />
            </div>
            <h4>Daily Activity Reporting</h4>
            <p>
              Caregivers effortlessly log meals eaten, rest times, learning milestones, mood, and outdoor play for parents to view instantly.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-wrapper" style={{ background: "#EFF9FA", color: "#00838F" }}>
              <Icon name="chart" size={24} />
            </div>
            <h4>Child Care Fee Management</h4>
            <p>
              Track monthly child care fees, registration fees, and daycare supplies. Reconcile cash or Telebirr/CBE payments with digital receipts.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-wrapper" style={{ background: "#F6F2FB", color: "#7E57C2" }}>
              <Icon name="desk" size={24} />
            </div>
            <h4>Front-Desk Duty Terminal</h4>
            <p>
              Assigned caregivers use a streamlined, touch-friendly terminal for fast child check-in, absence recording, and checkout.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-wrapper" style={{ background: "#FDECEE", color: "#C2185B" }}>
              <Icon name="heart" size={24} />
            </div>
            <h4>Health & Incident Observation</h4>
            <p>
              Record health notes and incidents factually, alerting parents immediately without diagnosing, keeping everyone aligned.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon-wrapper" style={{ background: "#FAF8EF", color: "#0F2438", border: "1px solid #DEDFD1" }}>
              <Icon name="message" size={24} />
            </div>
            <h4>Direct Office Messaging</h4>
            <p>
              Bridge the communication gap between parents and daycare staff through structured, private, and archived messages.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Testimonials ─── */}
      <section id="testimonials" className="landing-testimonials">
        <div className="section-head">
          <div className="section-subtitle">Real Impact</div>
          <h2 className="section-title">Trusted by Directors, Caregivers & Parents</h2>
          <p className="section-desc">
            Hear from the childcare professionals and families experiencing Ankelba every day.
          </p>
        </div>

        <div className="testimonials-grid">
          <div className="testimonial-card">
            <p className="testimonial-quote">
              "Ankelba changed the way we run our center. Parents love seeing what their children ate and when they napped. The pickup safety feature gives all of us immense peace of mind."
            </p>
            <div className="testimonial-author">
              <div className="author-circle">ST</div>
              <div className="author-meta">
                <strong>Selamawit Tadesse</strong>
                <span>Daycare Director · Bole, Addis Ababa</span>
              </div>
            </div>
          </div>

          <div className="testimonial-card">
            <p className="testimonial-quote">
              "As a working mom, I used to worry constantly. Now I open my Ankelba app and see updates of my son painting or having lunch. It feels like I'm right there with him."
            </p>
            <div className="testimonial-author">
              <div className="author-circle" style={{ background: "#FEF7E6", color: "#B7791F" }}>HD</div>
              <div className="author-meta">
                <strong>Hana Dawit</strong>
                <span>Mother of 3-year-old Nathan</span>
              </div>
            </div>
          </div>

          <div className="testimonial-card">
            <p className="testimonial-quote">
              "The front-desk attendance is so fast. In the morning, checking in children takes seconds, and we know exactly who is authorized to pick them up in the evening."
            </p>
            <div className="testimonial-author">
              <div className="author-circle" style={{ background: "#E6F8F9", color: "#00838F" }}>MK</div>
              <div className="author-meta">
                <strong>Meron Kebede</strong>
                <span>Lead Caregiver · Sunflower Room</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Call to Action Banner ─── */}
      <section className="landing-cta-banner">
        <h2>Ready to Modernize Your Daycare?</h2>
        <p>
          Register your daycare center today and join the platform transforming early childhood care across Ethiopia.
        </p>
        <Button
          variant="secondary"
          icon="arrow"
          onClick={() => {
            setError(null);
            setSubmittedSuccess(false);
            setModalOpen(true);
          }}
          style={{ background: "#FFFFFF", color: "var(--ankelba-navy)", fontWeight: 700 }}
        >
          Register Your Daycare Now
        </Button>
      </section>

      {/* ─── Footer ─── */}
      <footer style={{ padding: "3rem 2rem", borderTop: "1px solid var(--ankelba-border)", textAlign: "center", color: "var(--ankelba-muted)", fontSize: "0.85rem" }}>
        <p style={{ margin: "0 0 0.5rem 0", fontWeight: 700, color: "var(--ankelba-navy)" }}>
          Ankelba — Parent Communication and Child Activity Reporting Platform
        </p>
        <p style={{ margin: "0 0 0.75rem 0" }}>
          HiLCoE School of Computer Science and Technology · Senior Project
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: "1.5rem", margin: "1rem 0", flexWrap: "wrap" }}>
          <a href="/app" style={{ color: "var(--ankelba-teal)", fontWeight: 600, textDecoration: "none" }}>Parent App</a>
          <a href="/admin/login" style={{ color: "var(--ankelba-navy)", fontWeight: 600, textDecoration: "none" }}>Staff Sign In</a>
          <a href="/application-status" style={{ color: "var(--ankelba-navy)", fontWeight: 600, textDecoration: "none" }}>Check Application Status</a>
          <a href="/super-admin" style={{ color: "var(--ankelba-muted)", fontWeight: 500, textDecoration: "none" }}>Platform Console</a>
        </div>
        <p style={{ margin: 0 }}>
          © 2026 Ankelba Team. All rights reserved.
        </p>
      </footer>

      {/* ─── Daycare Registration Modal ─── */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="register-dialog" onClick={(e) => e.stopPropagation()}>
            <button className="dialog-close" onClick={() => setModalOpen(false)} aria-label="Close dialog">
              <Icon name="close" size={16} />
            </button>

            {submittedSuccess ? (
              <div className="status-card-success">
                <div style={{ display: "inline-flex", padding: "12px", borderRadius: "50%", background: "#FFFFFF", color: "#2E7D32", marginBottom: "0.75rem" }}>
                  <Icon name="checkCircle" size={40} />
                </div>
                <h4>Daycare Application Submitted!</h4>
                <p>
                  Thank you for registering <strong>{form.daycareName || "your center"}</strong> with Ankelba. Your application has been submitted to platform administration for review.
                </p>
                <div style={{ background: "#FFFFFF", borderRadius: "10px", padding: "1.25rem", margin: "1.25rem 0", textAlign: "left", fontSize: "0.88rem", border: "1px solid #C6E6D1" }}>
                  <strong style={{ display: "block", marginBottom: "0.5rem", color: "#1F2937" }}>
                    Next Steps:
                  </strong>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "#4B5563", lineHeight: 1.6 }}>
                    <li>Our platform administrator will review your application details.</li>
                    <li>Once approved, you can sign in directly with your administrator email.</li>
                    <li>You can check your application review status at any time.</li>
                  </ul>
                </div>
                <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setModalOpen(false);
                      navigateTo("/application-status");
                    }}
                  >
                    Check Application Status
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setModalOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="dialog-header">
                  <h3>Register Your Daycare Center</h3>
                  <p>Complete the form below to apply for your center’s workspace on Ankelba.</p>
                </div>

                {error && (
                  <div className="error-banner" role="alert" style={{ marginBottom: "1.25rem" }}>
                    <Icon name="alert" size={18} />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleRegisterSubmit}>
                  <div className="form-grid-two">
                    <div className="form-group full">
                      <label>Daycare Center Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Little Stars Early Learning Center"
                        value={form.daycareName}
                        onChange={(e) => setForm({ ...form, daycareName: e.target.value })}
                        className="landing-input"
                      />
                    </div>

                    <div className="form-group">
                      <label>City / Subcity *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Bole Subcity, Addis Ababa"
                        value={form.citySubcity}
                        onChange={(e) => setForm({ ...form, citySubcity: e.target.value })}
                        className="landing-input"
                      />
                    </div>

                    <div className="form-group">
                      <label>Business License / Reg. No.</label>
                      <input
                        type="text"
                        placeholder="e.g. BL-2024-998"
                        value={form.licenseNumber}
                        onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
                        className="landing-input"
                      />
                    </div>

                    <div className="form-group">
                      <label>Official Daycare Email *</label>
                      <input
                        type="email"
                        required
                        placeholder="info@littlestars.et"
                        value={form.contactEmail}
                        onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                        className="landing-input"
                      />
                    </div>

                    <div className="form-group">
                      <label>Official Phone Number *</label>
                      <input
                        type="tel"
                        required
                        placeholder="+251 91 123 4567"
                        value={form.contactPhone}
                        onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                        className="landing-input"
                      />
                    </div>

                    <div className="form-group full" style={{ borderTop: "1px solid var(--ankelba-border)", paddingTop: "1rem", marginTop: "0.5rem" }}>
                      <strong style={{ fontSize: "0.95rem", color: "var(--ankelba-navy)" }}>Director / Primary Administrator Account</strong>
                      <p style={{ margin: "0.25rem 0 0.75rem 0", fontSize: "0.82rem", color: "var(--ankelba-muted)" }}>
                        These credentials will be used to log in and manage your center once approved.
                      </p>
                    </div>

                    <div className="form-group">
                      <label>Director Full Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Selamawit Tadesse"
                        value={form.adminName}
                        onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                        className="landing-input"
                      />
                    </div>

                    <div className="form-group">
                      <label>Director Personal Phone *</label>
                      <input
                        type="tel"
                        required
                        placeholder="+251 91 987 6543"
                        value={form.adminPhone}
                        onChange={(e) => setForm({ ...form, adminPhone: e.target.value })}
                        className="landing-input"
                      />
                    </div>

                    <div className="form-group">
                      <label>Login Email Address *</label>
                      <input
                        type="email"
                        required
                        placeholder="director@littlestars.et"
                        value={form.adminEmail}
                        onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                        className="landing-input"
                      />
                    </div>

                    <div className="form-group">
                      <label>Password (min. 8 characters) *</label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        placeholder="••••••••"
                        value={form.adminPassword}
                        onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                        className="landing-input"
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                    <Button
                      variant="secondary"
                      onClick={() => setModalOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      type="submit"
                      disabled={loading}
                    >
                      {loading ? "Submitting Application…" : "Submit Registration →"}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
