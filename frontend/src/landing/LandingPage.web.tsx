import React, { useState, useEffect, useRef } from "react";
import "./landing.css";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { portalApi, apiError } from "../portal/api";
import { Icon } from "../portal/ui.web";
import HeroAtmosphere from "./HeroAtmosphere.web";
import AppShowcase from "./AppShowcase.web";
import LandingExperience from "./LandingExperience.web";
import LandingFooter from "./LandingFooter.web";

const logo = require("../../design/figma-exports/ankelba-symbol.png");

function NurseryBackdrop() {
  return (
    <div className="nursery-backdrop" aria-hidden="true">
      <svg className="nursery-shape nursery-sun" viewBox="0 0 100 100" fill="none"><circle cx="50" cy="50" r="23" fill="currentColor" opacity=".3" /><circle cx="50" cy="50" r="15" fill="currentColor" opacity=".55" /><path d="M50 8v10m0 64v10M8 50h10m64 0h10M20 20l7 7m46 46 7 7M20 80l7-7m46-46 7-7" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /></svg>
      <svg className="nursery-shape nursery-cloud" viewBox="0 0 140 80" fill="none"><path d="M30 64C4 64 4 30 28 28 30 3 70 0 79 25c23-10 43 7 39 24 23 10 7 25-10 21H31" fill="var(--ankelba-card)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
      <svg className="nursery-shape nursery-rainbow" viewBox="0 0 120 85" fill="none"><path d="M12 73a48 48 0 0 1 96 0" stroke="var(--pastel-peach)" strokeWidth="10" strokeLinecap="round" /><path d="M27 73a33 33 0 0 1 66 0" stroke="var(--pastel-yellow-text)" strokeOpacity=".22" strokeWidth="9" strokeLinecap="round" /><path d="M42 73a18 18 0 0 1 36 0" stroke="var(--pastel-green-text)" strokeOpacity=".2" strokeWidth="8" strokeLinecap="round" /></svg>
      <svg className="nursery-shape nursery-blocks" viewBox="0 0 100 110" fill="none"><rect x="12" y="52" width="42" height="42" rx="10" fill="var(--pastel-cyan)" stroke="currentColor" strokeWidth="2" /><rect x="50" y="55" width="38" height="38" rx="10" fill="var(--pastel-yellow)" stroke="var(--pastel-yellow-text)" strokeOpacity=".3" strokeWidth="2" /><path d="m32 45 19-31a5 5 0 0 1 8 0l19 31Z" fill="var(--pastel-pink)" stroke="var(--pastel-pink-text)" strokeOpacity=".2" strokeWidth="2" /></svg>
      <svg className="nursery-shape nursery-star" viewBox="0 0 80 80" fill="none"><path d="m40 8 9 20 22 3-16 16 4 23-19-11-20 11 4-23L8 31l23-3Z" fill="var(--pastel-purple)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
    </div>
  );
}

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
  const scrollRoot = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const [overHero, setOverHero] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<RegisterFormState>(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  useEffect(() => {
    const root = scrollRoot.current;
    const heroNode = hero.current;
    const navNode = navigation.current;
    if (!root || !heroNode || !navNode) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      setOverHero(heroNode.getBoundingClientRect().bottom > navNode.getBoundingClientRect().bottom + 12);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    root.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    observer.observe(heroNode);
    observer.observe(navNode);
    update();
    return () => {
      root.removeEventListener("scroll", schedule);
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, []);

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


  return (
    <div ref={scrollRoot} className="ankelba-home-container centered-home-experiment">
      <header ref={navigation} className="ankelba-home-nav" data-over-hero={overHero}>
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
      <section ref={hero} className="ankelba-home-hero" aria-label="Connected childcare with Ankelba">
        <HeroAtmosphere />
        <motion.div
          className="hero-content"
          initial={reduce ? { opacity: 1, x: 0 } : { opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" as const }}
        >
          <h1 className="hero-title">
            Big peace of mind.<br />
            <span className="highlight">For their little world.</span>
          </h1>
          <p className="hero-subtitle">
            Follow meals, naps and activities, message your daycare, and keep pickup details in one place.
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
              Register your daycare <Icon name="arrow" size={18} />
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

        </motion.div>

        <AppShowcase />
      </section>


      <LandingExperience />

      <section id="everyday-clarity" className="ankelba-home-why">
        <NurseryBackdrop />
        <motion.div className="section-head" {...fadeIn}>

          <h2 className="section-title">Keep records in one place</h2>
          <p className="section-desc">
            Compare paper-based routines with attendance, guardian, payment and reporting records in Ankelba.
          </p>
        </motion.div>

        <motion.div className="care-comparison" {...fadeIn}>
          <table>
            <caption className="comparison-sr-only">How Ankelba supports everyday daycare routines compared with paper records</caption>
            <thead><tr><th scope="col">Everyday care</th><th scope="col"><strong>Paper & phone calls</strong></th><th scope="col" className="comparison-better"><strong>With Ankelba</strong></th></tr></thead>
            <tbody>{[
              { icon: "clock", label: "Attendance", before: "Sign-in sheets to fill out, file and find again.", after: "Check-in and checkout times, together in one clear record." },
              { icon: "shield", label: "Pickup", before: "Guardian details scattered across forms and phone calls.", after: "Authorized guardian photos and details ready for staff to verify." },
              { icon: "file", label: "Care fees", before: "Paper receipts and separate payment records to reconcile.", after: "Organized fee tracking and payment records for the daycare office." },
              { icon: "heart", label: "Daily moments", before: "Families waiting until pickup to hear about meals, naps and play.", after: "Daily reports that bring families closer to their child’s day." },
            ].map(item => <tr key={item.label}><th scope="row"><span className="comparison-topic"><Icon name={item.icon} size={19} />{item.label}</span></th><td><span className="comparison-mobile-label">Paper & phone calls</span><span className="comparison-cell"><span className="comparison-marker"><Icon name="close" size={14} /></span>{item.before}</span></td><td className="comparison-better"><span className="comparison-mobile-label">With Ankelba</span><span className="comparison-cell"><span className="comparison-marker"><Icon name="check" size={14} /></span>{item.after}</span></td></tr>)}</tbody>
          </table>
        </motion.div>
      </section>

      <section className="ankelba-home-faq" id="questions">
        <NurseryBackdrop />
        <motion.div {...fadeIn}><h2 className="section-title">Common questions</h2><p className="section-desc">Getting connected starts with your daycare.</p></motion.div>
        <div className="faq-list">{[
          { question: "Who is Ankelba for?", answer: "Ankelba connects parents and guardians with caregivers and daycare administrators. Families use the parent app, while staff manage their responsibilities through the daycare portal." },
          { question: "How do parents get connected?", answer: "Your daycare needs to be registered with Ankelba. Ask the daycare team about getting your parent account connected to your child’s profile, then sign in through the parent app." },
          { question: "What can families follow during the day?", answer: "Caregivers can record meals, sleep, learning, play, mood and observations. Parents can review the reports shared by their daycare and use messages to keep the conversation going." },
          { question: "How does a daycare get started?", answer: "Select Register Daycare to submit your center’s details and a director account. You can check the application’s progress using the application status page." },
        ].map(item => <details key={item.question}><summary>{item.question}<span aria-hidden="true">+</span></summary><p>{item.answer}</p></details>)}</div>
      </section>
      <LandingFooter
        onRegister={daycareName => {
          openRegisterModal();
          setForm(previous => ({ ...previous, daycareName }));
        }}
        onBackToTop={() => scrollRoot.current?.scrollTo({ top: 0, behavior: reduce ? "instant" : "smooth" })}
      />
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
