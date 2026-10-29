import React, { useState, useEffect } from "react";
import "./landing.css";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { portalApi, apiError } from "../portal/api";
import { Icon } from "../portal/ui.web";

const paintingPhoto = require("../../assets/design/03-home-dashboard-1.jpg");
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
  requestedPlan: "standard" | "premium";
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
  requestedPlan: "standard",
};

export default function LandingPage() {
  const reduce = useReducedMotion();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<RegisterFormState>(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && modalOpen) setModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalOpen]);

  const navigateTo = (path: string) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const openRegisterModal = (plan: "standard" | "premium" = "standard") => {
    setError(null);
    setSubmittedSuccess(false);
    setForm((prev) => ({ ...prev, requestedPlan: plan }));
    setModalOpen(true);
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
        requestedPlan: form.requestedPlan,
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

  // Motion animation presets
  const fadeIn = {
    initial: reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.15 },
    transition: { duration: 0.45, ease: "easeOut" as const },
  };

  const staggerContainer = {
    initial: {},
    whileInView: {
      transition: {
        staggerChildren: 0.08,
      },
    },
    viewport: { once: true, amount: 0.15 },
  };

  return (
    <div className="ankelba-home-container">
      {/* ─── Navigation Header ─── */}
      <header className="ankelba-home-nav">
        <a className="ankelba-home-brand" href="/" aria-label="Ankelba Home">
          <img src={logo} alt="Ankelba Emblem" className="ankelba-home-brand-logo" />
          <div className="ankelba-home-brand-text">
            <strong>Ankelba</strong>
            <span>NURTURE • CONNECT • SAFEGUARD</span>
          </div>
        </a>

        <nav className="ankelba-home-menu" aria-label="Main Navigation">
          <a href="#why-ankelba">Why Ankelba</a>
          <a href="#features">Features</a>
          <a href="#a-day-together">How it works</a>
          <a href="#for-everyone">For your team</a>
          <a href="/application-status">Check Status</a>
        </nav>

        <div className="ankelba-home-nav-actions">
          <motion.button
            whileHover={reduce ? undefined : { y: -1 }}
            whileTap={reduce ? undefined : { scale: 0.98 }}
            type="button"
            className="btn-pill btn-pill-secondary"
            onClick={() => navigateTo("/app")}
          >
            Parent App
          </motion.button>
          <motion.button
            whileHover={reduce ? undefined : { y: -1 }}
            whileTap={reduce ? undefined : { scale: 0.98 }}
            type="button"
            className="btn-pill btn-pill-ghost"
            onClick={() => navigateTo("/admin/login")}
          >
            Staff Sign In
          </motion.button>
          <motion.button
            whileHover={reduce ? undefined : { y: -1 }}
            whileTap={reduce ? undefined : { scale: 0.98 }}
            type="button"
            className="btn-pill btn-pill-primary"
            onClick={() => openRegisterModal()}
          >
            Register Daycare <Icon name="arrow" size={16} />
          </motion.button>
        </div>
      </header>

      {/* Parent app preview and daily activity photography */}
      <section className="ankelba-home-hero" aria-label="Connected childcare with Ankelba">
        <motion.div
          className="hero-content"
          initial={reduce ? { opacity: 1, x: 0 } : { opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" as const }}
        >
          <div className="ankelba-home-eyebrow">
            <Icon name="sparkles" size={15} />
            <span>Nurture. Connect. Safeguard.</span>
          </div>
          <h1 className="hero-title">
            Big peace of mind.<br />
            <span className="highlight">For their little world.</span>
          </h1>
          <p className="hero-subtitle">
            From the first hello to the last pickup, stay connected to the moments that make their day. One caring connection between families and daycare.
          </p>

          <div className="hero-cta-group">
            <motion.button
              whileHover={reduce ? undefined : { y: -2 }}
              whileTap={reduce ? undefined : { scale: 0.98 }}
              type="button"
              className="btn-pill btn-pill-primary"
              onClick={() => openRegisterModal()}
              style={{ padding: "0.85rem 1.75rem", fontSize: "1rem" }}
            >
              Bring Ankelba to your daycare <Icon name="arrow" size={18} />
            </motion.button>
            <motion.button
              whileHover={reduce ? undefined : { y: -1 }}
              whileTap={reduce ? undefined : { scale: 0.98 }}
              type="button"
              className="btn-pill btn-pill-secondary"
              onClick={() => {
                document.getElementById("a-day-together")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
              }}
              style={{ padding: "0.85rem 1.5rem" }}
            >
              See How It Works
            </motion.button>
          </div>

          <div className="hero-benefits"><span><Icon name="heart" size={16} /> Daily moments</span><span><Icon name="message" size={16} /> Closer conversations</span><span><Icon name="shield" size={16} /> Safer handovers</span></div>
          <div className="hero-reassurance"><Icon name="shield" size={18} /><span>Thoughtful care. Shared moments. Safer pickups.</span></div>
        </motion.div>

        <motion.div className="day-preview" initial={reduce ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="preview-heading"><span className="preview-brand"><img src={logo} alt="" /> Ankelba</span><span className="preview-label">A glimpse of the parent app</span></div>
          <div className="preview-greeting"><span>A little closer, every day</span><h2>Here’s how Liya’s day is going.</h2></div>
          <div className="preview-child"><div className="child-initial">L</div><div><strong>Liya</strong><small>Sunflower Group · Checked in at 8:04 AM</small></div><span className="present-badge">At daycare</span></div>
          <div className="preview-section-title"><strong>Today’s little highlights</strong><span>Sample day</span></div>
          <div className="preview-highlights">
            {[
              { icon: "leaf", category: "Meals", detail: "Breakfast enjoyed", tone: "yellow" },
              { icon: "clock", category: "Sleep", detail: "A restful little nap", tone: "purple" },
              { icon: "sparkles", category: "Learning", detail: "Colors & shapes", tone: "cyan" },
              { icon: "heart", category: "Mood", detail: "Happy & curious", tone: "pink" },
            ].map(item => <div className={`preview-highlight tone-${item.tone}`} key={item.category}><Icon name={item.icon} size={22} /><small>{item.category}</small><strong>{item.detail}</strong></div>)}
          </div>
          <div className="preview-memory"><img src={paintingPhoto} alt="A child exploring colors through finger painting" /><div><span>SMALL HANDS. BIG DISCOVERIES.</span><strong>A little creativity, shared with you.</strong></div></div>
          <div className="preview-note"><span><Icon name="message" size={18} /> A note from Sara, caregiver</span><p>“Liya loved painting today. So many little discoveries to share with you!”</p></div>
          <div className="preview-bottom"><Icon name="shield" size={16} /><span>Connected through every part of their day.</span></div>
        </motion.div>
      </section>

      <div className="care-ribbon" aria-label="Connected care"><span>Little moments, beautifully connected.</span><span><Icon name="heart" size={18} /> For families</span><span><Icon name="child" size={18} /> For caregivers</span><span><Icon name="home" size={18} /> For daycares</span></div>
      {/* ─── Why Ankelba Section (Comparison) ─── */}
      <section id="why-ankelba" className="ankelba-home-why">
        <motion.div className="section-head" {...fadeIn}>
          <div className="section-subtitle">The Ankelba Advantage</div>
          <h2 className="section-title">Why Daycares Are Leaving Paper Behind</h2>
          <p className="section-desc">
            Manual paper logs and phone calls cause lost attendance records, delayed incident reporting, and anxious parents. Ankelba brings clarity, safety, and operational excellence to your center.
          </p>
        </motion.div>

        <div className="comparison-grid">
          {/* Traditional Card */}
          <motion.div className="comparison-card traditional" {...fadeIn}>
            <span className="comparison-badge">Traditional Daycare</span>
            <h3>Manual Paper & Memory</h3>
            <ul className="comparison-list">
              <li>
                <span className="icon-cross"><Icon name="close" size={16} /></span>
                <span>Paper sign-in binders that get lost, damaged, or filled out illegibly.</span>
              </li>
              <li>
                <span className="icon-cross"><Icon name="close" size={16} /></span>
                <span>Unverified pickups with no photo confirmation of authorized adult guardians.</span>
              </li>
              <li>
                <span className="icon-cross"><Icon name="close" size={16} /></span>
                <span>Awkward care fee collection with crumpled paper receipts and lost records.</span>
              </li>
              <li>
                <span className="icon-cross"><Icon name="close" size={16} /></span>
                <span>Parents constantly calling or worrying about meals, naps, and health during the day.</span>
              </li>
            </ul>
          </motion.div>

          {/* Ankelba Card */}
          <motion.div
            className="comparison-card ankelba"
            {...fadeIn}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <span className="comparison-badge">Ankelba Platform</span>
            <h3>Organized, Secure & Real-Time</h3>
            <ul className="comparison-list">
              <li>
                <span className="icon-check"><Icon name="check" size={16} /></span>
                <span>Fast front-desk check-in and checkout with automatic time logs and timestamps.</span>
              </li>
              <li>
                <span className="icon-check"><Icon name="check" size={16} /></span>
                <span>Strict pickup verification matching guardian photos and identification cards.</span>
              </li>
              <li>
                <span className="icon-check"><Icon name="check" size={16} /></span>
                <span>Clear child care fee tracking, instant digital payment reconciliation, and receipts.</span>
              </li>
              <li>
                <span className="icon-check"><Icon name="check" size={16} /></span>
                <span>Parents receive structured daily reports (meals, rest, activities) right on their mobile app.</span>
              </li>
            </ul>
          </motion.div>
        </div>
      </section>

      {/* ─── Core Features Showcase ─── */}
      <section id="features" className="ankelba-home-features">
        <motion.div className="section-head" {...fadeIn}>
          <div className="section-subtitle">The everyday essentials</div>
          <h2 className="section-title">Less chasing details. More connected care.</h2>
          <p className="section-desc">
            From classroom updates to the front desk, keep the details that matter within reach.
          </p>
        </motion.div>

        <motion.div className="features-grid" variants={staggerContainer} initial="initial" whileInView="whileInView">
          <motion.div className="feature-card" {...fadeIn}>
            <div className="feature-icon-wrapper" style={{ background: "var(--pastel-green)", color: "var(--pastel-green-text)" }}>
              <Icon name="shield" size={26} />
            </div>
            <h4>Verified Child Pickup Safety</h4>
            <p>
              Only authorized adults can collect a child. Staff verify guardian photo identification before releasing the child, backed by full audit logging.
            </p>
          </motion.div>

          <motion.div className="feature-card" {...fadeIn}>
            <div className="feature-icon-wrapper" style={{ background: "var(--pastel-yellow)", color: "var(--pastel-yellow-text)" }}>
              <Icon name="clipboard" size={26} />
            </div>
            <h4>Daily Activity Reporting</h4>
            <p>
              Caregivers effortlessly log meals eaten, rest times, learning milestones, mood, and outdoor play for parents to view instantly.
            </p>
          </motion.div>

          <motion.div className="feature-card" {...fadeIn}>
            <div className="feature-icon-wrapper" style={{ background: "var(--pastel-cyan)", color: "var(--pastel-cyan-text)" }}>
              <Icon name="chart" size={26} />
            </div>
            <h4>Child Care Fee Management</h4>
            <p>
              Track monthly care fees, registration fees, and daycare supplies. Reconcile cash or digital gateway payments with transparent receipts.
            </p>
          </motion.div>

          <motion.div className="feature-card" {...fadeIn}>
            <div className="feature-icon-wrapper" style={{ background: "var(--pastel-purple)", color: "var(--pastel-purple-text)" }}>
              <Icon name="desk" size={26} />
            </div>
            <h4>Front-Desk Duty Terminal</h4>
            <p>
              Assigned staff use a streamlined, touch-friendly terminal for fast child check-in, absence recording, and authorized release.
            </p>
          </motion.div>

          <motion.div className="feature-card" {...fadeIn}>
            <div className="feature-icon-wrapper" style={{ background: "var(--pastel-pink)", color: "var(--pastel-pink-text)" }}>
              <Icon name="heart" size={26} />
            </div>
            <h4>Health & Incident Observation</h4>
            <p>
              Record health notes and incidents factually, alerting parents immediately without diagnosing, keeping families and directors aligned.
            </p>
          </motion.div>

          <motion.div className="feature-card" {...fadeIn}>
            <div className="feature-icon-wrapper" style={{ background: "var(--ankelba-cream)", color: "var(--ankelba-navy)", border: "1px solid var(--ankelba-border)" }}>
              <Icon name="message" size={26} />
            </div>
            <h4>Direct Office Messaging</h4>
            <p>
              Bridge the communication gap between parents and daycare staff through structured, private, and archived messages.
            </p>
          </motion.div>
        </motion.div>
      </section>

      <section id="a-day-together" className="ankelba-home-journey">
        <motion.div className="section-head" {...fadeIn}>
          <div className="section-subtitle">From hello to home time</div>
          <h2 className="section-title">A whole day of care.<br />A connection that stays with you.</h2>
          <p className="section-desc">The everyday rhythm of daycare, brought together in one shared story.</p>
        </motion.div>
        <div className="journey-grid">
          {[
            { time: "01 / ARRIVE", icon: "home", title: "Start with a reassuring hello", text: "Staff record check-in, so families can see that their child has arrived and settled into the day.", tone: "yellow" },
            { time: "02 / DISCOVER", icon: "sparkles", title: "Let the little moments reach home", text: "Meals, naps, play and learning become a daily report parents can follow around their own busy day.", tone: "cyan" },
            { time: "03 / RECONNECT", icon: "shield", title: "End the day with a careful handover", text: "Staff check authorized guardian details before pickup and record the checkout for a clear handover history.", tone: "purple" },
          ].map(item => <motion.article className="journey-step" key={item.time} {...fadeIn}><span className="journey-time">{item.time}</span><div className={`journey-icon tone-${item.tone}`}><Icon name={item.icon} size={28} /></div><h3>{item.title}</h3><p>{item.text}</p></motion.article>)}
        </div>
      </section>

      <section className="ankelba-home-connection" aria-labelledby="connection-title">
        <motion.div className="connection-story" {...fadeIn}>
          <span className="section-subtitle">More than an update</span>
          <h2 id="connection-title" className="section-title">“How was their day?”<br />Now there’s a little more to tell.</h2>
          <p className="section-desc">A meal enjoyed. A new discovery. A much-needed nap. These details help families feel involved and give caregivers a simple way to share the care behind every day.</p>
          <ul className="connection-points"><li><Icon name="checkCircle" size={20} /> Understand routines through daily reports</li><li><Icon name="checkCircle" size={20} /> Keep questions and conversations in one place</li><li><Icon name="checkCircle" size={20} /> Carry the conversation from daycare to home</li></ul>
          <a href="/app" className="btn-pill btn-pill-primary">Explore the parent app <Icon name="arrow" size={18} /></a>
        </motion.div>
        <motion.div className="connection-photo" {...fadeIn}><img src={paintingPhoto} alt="Finger painting during a creative daycare activity" loading="lazy" /><div className="memory-caption"><span><Icon name="sparkles" size={20} /> A moment worth sharing</span><h3>Today’s colors.<br />Tonight’s conversation.</h3><p>Small discoveries make wonderful stories.</p></div></motion.div>
      </section>

      <section id="for-everyone" className="ankelba-home-audiences">
        <motion.div className="section-head" {...fadeIn}><div className="section-subtitle">One circle of care</div><h2 className="section-title">Made for everyone<br />who makes their day.</h2><p className="section-desc">Different responsibilities. The same shared purpose: thoughtful care for every child.</p></motion.div>
        <div className="audience-grid">
          {[
            { icon: "heart", label: "For families", title: "Feel closer, wherever you are.", text: "Follow daily routines, reach your daycare and keep authorized pickup details organized.", items: ["Daily reports and activity updates", "Messages and daycare announcements", "Guardian and child information"], tone: "pink" },
            { icon: "child", label: "For caregivers", title: "Give your care a shared voice.", text: "Keep families informed with a clear record of the moments and observations that matter.", items: ["Meals, rest, learning and mood", "Health and incident observations", "Conversations with families"], tone: "yellow" },
            { icon: "building", label: "For daycare teams", title: "Bring the busy day together.", text: "Keep the front desk, classrooms and office working from organized daycare records.", items: ["Attendance and pickup records", "Child, guardian and staff details", "Care fees and payment records"], tone: "cyan" },
          ].map(item => <motion.article className={`audience-card tone-${item.tone}`} key={item.label} {...fadeIn}><Icon name={item.icon} size={30} /><span className="audience-label">{item.label}</span><h3>{item.title}</h3><p>{item.text}</p><ul>{item.items.map(point => <li key={point}><Icon name="check" size={16} />{point}</li>)}</ul></motion.article>)}
        </div>
      </section>

      <section className="ankelba-home-safety" aria-labelledby="safety-title">
        <motion.div {...fadeIn}><span className="safety-emblem"><Icon name="shield" size={36} /></span><div className="section-subtitle">Care continues at the door</div><h2 id="safety-title" className="section-title">Every handover<br />deserves a little extra care.</h2><p>Pickup is a responsibility shared by families and staff. Ankelba brings guardian information, verification and checkout records into that important moment.</p></motion.div>
        <div className="safety-steps">{[
          { title: "Know who is authorized", text: "Keep guardian details and photos available for staff to review." },
          { title: "Verify before they leave", text: "Give staff a clear pickup process centered on the authorized adult." },
          { title: "Keep a record of the handover", text: "Record checkout details so the daycare can refer back to the pickup history." },
        ].map((item, index) => <div className="safety-step" key={item.title}><span>0{index + 1}</span><div><h3>{item.title}</h3><p>{item.text}</p></div></div>)}</div>
      </section>

      <section className="ankelba-home-faq" id="questions">
        <motion.div {...fadeIn}><div className="section-subtitle">A few things you might wonder</div><h2 className="section-title">A little clarity,<br />before you begin.</h2><p className="section-desc">Getting connected starts with your daycare.</p></motion.div>
        <div className="faq-list">{[
          { question: "Who is Ankelba for?", answer: "Ankelba connects parents and guardians with caregivers and daycare administrators. Families use the parent app, while staff manage their responsibilities through the daycare portal." },
          { question: "How do parents get connected?", answer: "Your daycare needs to be registered with Ankelba. Ask the daycare team about getting your parent account connected to your child’s profile, then sign in through the parent app." },
          { question: "What can families follow during the day?", answer: "Caregivers can record meals, sleep, learning, play, mood and observations. Parents can review the reports shared by their daycare and use messages to keep the conversation going." },
          { question: "How does a daycare get started?", answer: "Select Register Daycare to submit your center’s details and a director account. You can check the application’s progress using the application status page." },
        ].map(item => <details key={item.question}><summary>{item.question}<span aria-hidden="true">+</span></summary><p>{item.answer}</p></details>)}</div>
      </section>

      {/* ─── CTA Banner ─── */}
      <section className="ankelba-home-cta-banner">
        <motion.div {...fadeIn}>
          <h2>Make room for more connected care.</h2>
          <p>
            Bring families and your daycare team closer to the little moments that matter. Start your Ankelba daycare application today.
          </p>
          <motion.button
            whileHover={reduce ? undefined : { y: -2 }}
            whileTap={reduce ? undefined : { scale: 0.98 }}
            type="button"
            className="btn-pill btn-pill-primary"
            onClick={() => openRegisterModal()}
            style={{ padding: "0.95rem 2rem", fontSize: "1.05rem" }}
          >
            Register Your Daycare Now <Icon name="arrow" size={18} />
          </motion.button>
        </motion.div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="ankelba-home-footer">
        <p style={{ margin: "0 0 0.5rem 0", fontWeight: 700, color: "var(--ankelba-navy)" }}>
          Ankelba — Parent Communication and Child Activity Reporting Platform
        </p>
        <p style={{ margin: "0 0 0.85rem 0" }}>
          HiLCoE School of Computer Science and Technology · Senior Project Baseline
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: "1.75rem", margin: "1.25rem 0", flexWrap: "wrap" }}>
          <a href="/app" style={{ color: "var(--ankelba-green)", fontWeight: 700, textDecoration: "none" }}>Parent Mobile App</a>
          <a href="/admin/login" style={{ color: "var(--ankelba-navy)", fontWeight: 600, textDecoration: "none" }}>Staff Sign In</a>
          <a href="/application-status" style={{ color: "var(--ankelba-navy)", fontWeight: 600, textDecoration: "none" }}>Check Application Status</a>
          <a href="/super-admin" style={{ color: "var(--ankelba-subtle)", fontWeight: 500, textDecoration: "none" }}>Platform Console</a>
        </div>
        <p style={{ margin: 0 }}>
          © 2026 Ankelba Team. All rights reserved.
        </p>
      </footer>

      {/* ─── Daycare Registration Modal (Solid Backdrop, Zero Glassmorphism) ─── */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setModalOpen(false)}
          >
            <motion.div
              className="register-dialog"
              initial={reduce ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.25 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button className="dialog-close" onClick={() => setModalOpen(false)} aria-label="Close dialog">
                <Icon name="close" size={16} />
              </button>

              <div className="dialog-header">
                <h3>Register Your Daycare</h3>
                <p>Submit your application to launch your center on the Ankelba platform.</p>
              </div>

              {error && (
                <div role="alert" style={{ background: "#FDECEE", color: "#C2185B", padding: "0.85rem 1.15rem", borderRadius: "12px", marginBottom: "1.25rem", border: "1px solid #F8D2DA", fontSize: "0.92rem", fontWeight: 600 }}>
                  {error}
                </div>
              )}

              {submittedSuccess ? (
                <div style={{ textAlign: "center", padding: "2rem 1rem" }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--pastel-green)", color: "var(--pastel-green-text)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem" }}>
                    <Icon name="check" size={28} />
                  </div>
                  <h4 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 0.5rem 0", color: "var(--ankelba-navy)" }}>Application Submitted!</h4>
                  <p style={{ color: "var(--ankelba-muted)", maxWidth: 440, margin: "0 auto 1.5rem" }}>
                    Your registration has been forwarded to the Platform Operator for verification. You can track your approval status anytime.
                  </p>
                  <motion.button
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    className="btn-pill btn-pill-primary"
                    onClick={() => {
                      setModalOpen(false);
                      navigateTo("/application-status");
                    }}
                  >
                    Track Application Status →
                  </motion.button>
                </div>
              ) : (
                <form onSubmit={handleRegisterSubmit}>
                  <div className="form-grid-two">
                    <div className="form-group">
                      <label htmlFor="daycareName">Daycare Center Name *</label>
                      <input
                        id="daycareName"
                        type="text"
                        required
                        placeholder="e.g. Bright Stars Daycare"
                        value={form.daycareName}
                        onChange={(e) => setForm({ ...form, daycareName: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="citySubcity">City & Subcity *</label>
                      <input
                        id="citySubcity"
                        type="text"
                        required
                        placeholder="e.g. Bole Subcity, Addis Ababa"
                        value={form.citySubcity}
                        onChange={(e) => setForm({ ...form, citySubcity: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-grid-two">
                    <div className="form-group">
                      <label htmlFor="contactEmail">Daycare Official Email *</label>
                      <input
                        id="contactEmail"
                        type="email"
                        required
                        placeholder="contact@brightstars.com"
                        value={form.contactEmail}
                        onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="contactPhone">Official Phone Number *</label>
                      <input
                        id="contactPhone"
                        type="tel"
                        required
                        placeholder="+251 91 123 4567"
                        value={form.contactPhone}
                        onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-group full">
                    <label htmlFor="licenseNumber">Trade / Educational License Number</label>
                    <input
                      id="licenseNumber"
                      type="text"
                      placeholder="e.g. BL-2026-8849"
                      value={form.licenseNumber}
                      onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
                    />
                  </div>

                  <div className="form-grid-two">
                    <div className="form-group">
                      <label htmlFor="adminName">Director / Admin Name *</label>
                      <input
                        id="adminName"
                        type="text"
                        required
                        placeholder="e.g. Selamawit Tadesse"
                        value={form.adminName}
                        onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="adminEmail">Director Sign-In Email *</label>
                      <input
                        id="adminEmail"
                        type="email"
                        required
                        placeholder="director@brightstars.com"
                        value={form.adminEmail}
                        onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-grid-two">
                    <div className="form-group">
                      <label htmlFor="adminPassword">Admin Account Password *</label>
                      <input
                        id="adminPassword"
                        type="password"
                        required
                        minLength={6}
                        placeholder="At least 6 characters"
                        value={form.adminPassword}
                        onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="requestedPlan">Subscription Plan Choice</label>
                      <select
                        id="requestedPlan"
                        value={form.requestedPlan}
                        onChange={(e) => setForm({ ...form, requestedPlan: e.target.value as "standard" | "premium" })}
                      >
                        <option value="standard">Standard Plan</option>
                        <option value="premium">Premium Plan</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end", gap: "1rem" }}>
                    <button
                      type="button"
                      className="btn-pill btn-pill-ghost"
                      onClick={() => setModalOpen(false)}
                      disabled={loading}
                    >
                      Cancel
                    </button>
                    <motion.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      disabled={loading}
                      className="btn-pill btn-pill-primary"
                      style={{ padding: "0.75rem 1.75rem" }}
                    >
                      {loading ? "Submitting Application..." : "Submit Application →"}
                    </motion.button>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
