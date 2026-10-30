import React, { useState, useEffect, useRef } from "react";
import "./landing.css";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { portalApi, apiError } from "../portal/api";
import { Icon } from "../portal/ui.web";
import HeroAtmosphere from "./HeroAtmosphere.web";

const paintingPhoto = require("../../assets/design/03-home-dashboard-1.jpg");
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

const overviewSteps = [
  { label: "Arrival", icon: "home", tone: "green", time: "8:04 AM", title: "Checked in and ready to play", text: "Liya has arrived at daycare. Her check-in time is recorded for the day.", detail: "Attendance recorded", detailIcon: "checkCircle" },
  { label: "Daily report", icon: "clipboard", tone: "yellow", time: "12:30 PM", title: "Lunch, a little learning, then rest", text: "Meals, activities and rest times give you a picture of how her day is going.", detail: "Daily report updated", detailIcon: "file" },
  { label: "Message", icon: "message", tone: "purple", time: "2:15 PM", title: "A message from her caregiver", text: "“Liya enjoyed painting with her friends today. She was excited to try mixing the colors.”", detail: "From Sara · Caregiver", detailIcon: "message" },
  { label: "Pickup", icon: "shield", tone: "cyan", time: "4:30 PM", title: "Guardian checked. Ready for home.", text: "Staff review the authorized guardian’s details before recording the child’s checkout.", detail: "Pickup verification", detailIcon: "shield" },
];

function DailyOverview() {
  const reduce = useReducedMotion();
  const container = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const current = overviewSteps[step];
  const playing = !reduce && !paused && visible && tabVisible;

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .2 });
    observer.observe(node);
    const onVisibility = () => setTabVisible(!document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setStep(value => (value + 1) % overviewSteps.length), 6000);
    return () => window.clearTimeout(timer);
  }, [playing, step]);

  return (
    <motion.div ref={container} data-playing={playing} className="daily-overview" initial={reduce ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65 }} aria-label="Example of a child’s day in Ankelba">
      <div className="overview-topbar"><div className="overview-brand"><img src={logo} alt="" /><strong>Liya’s day</strong><span>Sample day</span></div>{!reduce && <button type="button" className="overview-pause" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? "Play preview" : "Pause preview"}<span aria-hidden="true">{paused ? "▷" : "Ⅱ"}</span></button>}</div>
      <div className="overview-layout">
        <div className="overview-routine" role="group" aria-label="Explore the daily overview">
          <div className="overview-child"><span className="overview-avatar"><Icon name="child" size={26} /></span><div><strong>Liya</strong><span>Sunflower group</span></div></div>
          <div className="overview-step-list">{overviewSteps.map((item, index) => <button key={item.label} type="button" className={`overview-step ${step === index ? "is-current" : ""}`} aria-pressed={step === index} aria-controls="overview-detail" onClick={() => { setStep(index); setPaused(true); }}><span className={`overview-step-icon tone-${item.tone}`}><Icon name={item.icon} size={19} /></span><span>{item.label}</span><span className="overview-step-dot" aria-hidden="true" /></button>)}</div>
        </div>
        <div className="overview-story" id="overview-detail">
          <AnimatePresence mode="wait" initial={false}><motion.div key={step} className={`overview-moment tone-${current.tone}`} initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? { opacity: 1 } : { opacity: 0, y: -8 }} transition={{ duration: reduce ? 0 : .25 }}>
            <div className="overview-moment-meta"><span>{current.label}</span><time>{current.time}</time></div>
            <div className="overview-illustration" aria-hidden="true"><span className="overview-orbit orbit-one" /><span className="overview-orbit orbit-two" /><span className="overview-main-icon"><Icon name={current.icon} size={42} /></span><span className="overview-check"><Icon name="check" size={17} /></span></div>
            <h2>{current.title}</h2><p>{current.text}</p><div className="overview-confirmation"><Icon name={current.detailIcon} size={17} />{current.detail}</div>
          </motion.div></AnimatePresence>
          <div className="overview-progress" aria-hidden="true"><span key={`${step}-${playing}`} style={{ animationPlayState: playing ? "running" : "paused" }} /></div>
        </div>
        <div className="overview-report"><div className="overview-report-heading"><Icon name="file" size={18} /><strong>Daily highlights</strong></div>{[
          { title: "Meals", value: "Breakfast & lunch", icon: "leaf", tone: "yellow" },
          { title: "Rest", value: "Nap · 1 hr 15 min", icon: "clock", tone: "purple" },
          { title: "Learning", value: "Painting & colors", icon: "sparkles", tone: "cyan" },
          { title: "Mood", value: "Happy & curious", icon: "heart", tone: "pink" },
        ].map(item => <div key={item.title} className="overview-report-row"><span className={`overview-step-icon tone-${item.tone}`}><Icon name={item.icon} size={18} /></span><div><span>{item.title}</span><strong>{item.value}</strong></div></div>)}<div className="overview-report-footer"><Icon name="lock" size={15} /> Shared with her family</div></div>
      </div>
      <div className="overview-footer"><span>Morning check-in</span><div className="overview-dayline" aria-hidden="true">{overviewSteps.map((item, index) => <span key={item.label} className={index <= step ? "is-complete" : ""} />)}</div><span>Home time</span></div>
    </motion.div>
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
    <div className="ankelba-home-container centered-home-experiment">
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
      <section className="ankelba-home-hero" aria-label="Connected childcare with Ankelba">
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

        <DailyOverview />
      </section>


      <section id="why-ankelba" className="ankelba-home-value">
        <NurseryBackdrop />
        <motion.div className="section-head" {...fadeIn}><h2 className="section-title">Why Ankelba?</h2><p className="section-desc">Daily reports, direct messages and guardian details help families and daycare staff stay informed.</p></motion.div>
        <div className="value-grid">
          {[
            { icon: "heart", title: "Follow their daily routine", description: "See what your child ate, when they rested and which activities they joined.", tone: "pink", visual: <><span className="value-visual-icon"><Icon name="heart" size={32} /></span><div className="value-mini-pills"><span>Meals</span><span>Rest</span><span>Play</span></div></> },
            { icon: "message", title: "Talk to your daycare", description: "Send questions and read updates without searching through separate conversations.", tone: "cyan", visual: <><span className="value-visual-icon"><Icon name="message" size={36} /></span></> },
            { icon: "shield", title: "Keep pickup details ready", description: "Bring guardian details and pickup records together to support a more careful handover at home time.", tone: "green", visual: <><span className="value-visual-icon"><Icon name="shield" size={36} /></span><div className="value-mini-note"><span className="value-avatar"><Icon name="user" size={18} /></span><span>Authorized guardian</span><Icon name="checkCircle" size={18} /></div></> },
          ].map(item => <motion.article className="value-card" key={item.title} {...fadeIn}><div className={`value-visual tone-${item.tone}`}>{item.visual}</div><h3>{item.title}</h3><p>{item.description}</p></motion.article>)}
        </div>
      </section>

      <section id="a-day-together" className="ankelba-home-journey">
        <NurseryBackdrop />
        <motion.div className="section-head" {...fadeIn}>

          <h2 className="section-title">How Ankelba fits into the day</h2>
          <p className="section-desc">From morning check-in to afternoon pickup.</p>
        </motion.div>
        <div className="journey-grid">
          {[
            { time: "01 / ARRIVE", icon: "home", title: "Record arrival", text: "Staff record check-in, so families can see that their child has arrived and settled into the day.", tone: "yellow" },
            { time: "02 / DISCOVER", icon: "sparkles", title: "Share daily activities", text: "Meals, naps, play and learning become a daily report parents can follow around their own busy day.", tone: "cyan" },
            { time: "03 / RECONNECT", icon: "shield", title: "Verify pickup", text: "Staff check authorized guardian details before pickup and record the checkout for a clear handover history.", tone: "purple" },
          ].map(item => <motion.article className="journey-step" key={item.time} {...fadeIn}><span className="journey-time">{item.time}</span><div className={`journey-icon tone-${item.tone}`}><Icon name={item.icon} size={28} /></div><h3>{item.title}</h3><p>{item.text}</p></motion.article>)}
        </div>
      </section>

      <section className="ankelba-home-connection" aria-labelledby="connection-title">
        <NurseryBackdrop />
        <motion.div className="connection-story" {...fadeIn}>

          <h2 id="connection-title" className="section-title">Know how their day went</h2>
          <p className="section-desc">Daily reports cover meals, sleep, play and learning. Parents can check routines and ask caregivers about anything that needs attention.</p>
          <ul className="connection-points"><li><Icon name="checkCircle" size={20} /> Understand routines through daily reports</li><li><Icon name="checkCircle" size={20} /> Keep questions and conversations in one place</li><li><Icon name="checkCircle" size={20} /> Carry the conversation from daycare to home</li></ul>
          <a href="/app" className="btn-pill btn-pill-primary">Explore the parent app <Icon name="arrow" size={18} /></a>
        </motion.div>
        <motion.div className="connection-photo" {...fadeIn}><img src={paintingPhoto} alt="Finger painting during a creative daycare activity" loading="lazy" /><div className="memory-caption"><h3>Play and learning</h3><p>Activities are part of your child’s daily report.</p></div></motion.div>
      </section>
      <section id="features" className="ankelba-home-features">
        <NurseryBackdrop />
        <motion.div className="section-head" {...fadeIn}>

          <h2 className="section-title">Tools for daily daycare work</h2>
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
              Caregivers record meals, rest, learning, mood and play for parents to review.
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
            <h4>Front-desk attendance</h4>
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
              Parents and daycare staff can send messages and refer back to previous conversations.
            </p>
          </motion.div>
        </motion.div>
      </section>

      <section id="for-everyone" className="ankelba-home-audiences">
        <NurseryBackdrop />
        <motion.div className="section-head" {...fadeIn}><h2 className="section-title">For families and daycare staff</h2><p className="section-desc">Each person has access to the information they need.</p></motion.div>
        <div className="audience-grid">
          {[
            { icon: "heart", label: "For families", title: "Stay informed", text: "Follow daily routines, reach your daycare and keep authorized pickup details organized.", items: ["Daily reports and activity updates", "Messages and daycare announcements", "Guardian and child information"], tone: "pink" },
            { icon: "child", label: "For caregivers", title: "Record and share updates", text: "Keep families informed with a clear record of the moments and observations that matter.", items: ["Meals, rest, learning and mood", "Health and incident observations", "Conversations with families"], tone: "yellow" },
            { icon: "building", label: "For daycare teams", title: "Manage daycare records", text: "Keep the front desk, classrooms and office working from organized daycare records.", items: ["Attendance and pickup records", "Child, guardian and staff details", "Care fees and payment records"], tone: "cyan" },
          ].map(item => <motion.article className={`audience-card tone-${item.tone}`} key={item.label} {...fadeIn}><Icon name={item.icon} size={30} /><span className="audience-label">{item.label}</span><h3>{item.title}</h3><p>{item.text}</p><ul>{item.items.map(point => <li key={point}><Icon name="check" size={16} />{point}</li>)}</ul></motion.article>)}
        </div>
      </section>

      <section className="ankelba-home-safety" aria-labelledby="safety-title">
        <NurseryBackdrop />
        <motion.div {...fadeIn}><span className="safety-emblem"><Icon name="shield" size={36} /></span><h2 id="safety-title" className="section-title">Check who is collecting each child</h2><p>Pickup is a responsibility shared by families and staff. Ankelba brings guardian information, verification and checkout records into that important moment.</p></motion.div>
        <div className="safety-steps">{[
          { title: "Know who is authorized", text: "Keep guardian details and photos available for staff to review." },
          { title: "Verify before they leave", text: "Give staff a clear pickup process centered on the authorized adult." },
          { title: "Keep a record of the handover", text: "Record checkout details so the daycare can refer back to the pickup history." },
        ].map((item, index) => <div className="safety-step" key={item.title}><span>0{index + 1}</span><div><h3>{item.title}</h3><p>{item.text}</p></div></div>)}</div>
      </section>
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
      <section className="ankelba-home-cta-banner">
        <NurseryBackdrop />
        <motion.div {...fadeIn}>
          <h2>Bring Ankelba to your daycare</h2>
          <p>
            Submit your daycare details to get started. You can track your application’s progress online.
          </p>
          <motion.button
            whileHover={reduce ? undefined : { y: -2 }}
            whileTap={reduce ? undefined : { scale: 0.98 }}
            type="button"
            className="btn-pill btn-pill-primary"
            onClick={() => openRegisterModal()}
            style={{ padding: "0.95rem 2rem", fontSize: "1.05rem" }}
          >
            Register your daycare <Icon name="arrow" size={18} />
          </motion.button>
        </motion.div>
      </section>
      <footer className="ankelba-home-footer">
        <p style={{ margin: "0 0 0.5rem 0", fontWeight: 700, color: "var(--ankelba-navy)" }}>
          Ankelba
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
