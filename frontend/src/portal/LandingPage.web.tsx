import React, { useEffect, useState } from "react";
import "./saas.css";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Modal } from "./ui.web";
import { portalApi, apiError } from "./api";
import { Icon } from "./ui.web";

import PackageCards from './PackageCards.web';
import {PackageOffer,Cycle,priceLabel} from './subscriptions';
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
  requestedPlan: "standard" | "premium";
  billingCycle: Cycle;
  termsVersion: number;
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
  requestedPlan: "standard", billingCycle: "monthly", termsVersion: 0,
};

export default function LandingPage() {
  const reduce = useReducedMotion();
  const reveal = {
    initial: reduce ? (false as const) : { opacity: 0, y: 22 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.15 },
    transition: { duration: 0.5 },
  };
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<RegisterFormState>(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<any | null>(null);

  const [offers,setOffers]=useState<PackageOffer[]>([]);
  const [catalogError,setCatalogError]=useState('');
  const [catalogLoading,setCatalogLoading]=useState(true);
  const loadPackages=async()=>{setCatalogLoading(true);setCatalogError('');try{setOffers(await portalApi.packages());}catch(e){setCatalogError(apiError(e));}finally{setCatalogLoading(false);}};
  useEffect(()=>{void loadPackages();},[]);
  const chosen=offers.find(p=>p.code===form.requestedPlan);
  const navigateTo = (path: string) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const openRegisterModal = (offer:PackageOffer) => {
    setForm(prev=>({...prev,requestedPlan:offer.code,termsVersion:offer.version}));
    setError(null);setSuccessResult(null);setModalOpen(true);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await portalApi.registerDaycare(form);
      setSuccessResult(res.daycare);
      setForm(prev=>({...prev,adminPassword:""}));
    } catch (err: any) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="saas-landing">
      <a className="landing-skip" href="#main">
        Skip to content
      </a>
      <header className="saas-nav">
        <a className="saas-brand" href="/" aria-label="Ankelba home">
          <img src={logo} alt="" />
          <div>
            <strong>Ankelba</strong>
            <span>Care, connected.</span>
          </div>
        </a>
        <nav aria-label="Main navigation">
          <a href="#features">A better day</a>
          <a href="#how-it-works">How it works</a>
          <a href="#packages">Packages</a>
          <a href="/application-status">Application status</a>
          <a href="#questions">Questions</a>
        </nav>
        <div className="saas-nav-actions">
          <a className="landing-login" href="/app">
            Parent sign in
          </a>
          <a className="saas-btn saas-btn-primary" href="/admin">
            Daycare sign in <Icon name="arrow" size={17} />
          </a>
        </div>
      </header>
      <main id="main">
        <section className="landing-hero">
          <motion.div className="landing-hero-copy" {...reveal}>
            <span className="landing-eyebrow">
              <span /> FOR THE PEOPLE WHO CARE
            </span>
            <h1>
              Little moments.
              <br />
              <em>A closer</em>
              <br />
              connection.
            </h1>
            <p>
              From the first hello to the last pickup, bring your daycare team
              and families together. A clearer picture of their day. More room
              for care.
            </p>
            <div className="landing-actions">
              <button
                className="saas-btn saas-btn-primary"
                onClick={() => document.getElementById("packages")?.scrollIntoView({behavior:reduce?"auto":"smooth"})}
              >
                Choose your package <Icon name="arrow" size={18} />
              </button>
              <a href="#how-it-works" className="landing-text-link">
                Take a look around <span>↗</span>
              </a>
            </div>
            <div className="landing-hero-note">
              <Icon name="heart" size={18} /> Made for caregivers. Shared with
              families.
            </div>
          </motion.div>
          <motion.div
            className="landing-art"
            {...reveal}
            transition={{ duration: 0.65, delay: reduce ? 0 : 0.1 }}
          >
            <div className="landing-art-label">
              A LITTLE CLOSER, EVEN WHEN YOU’RE APART.
            </div>
            <img
              className="landing-illustration"
              src={require("../../assets/design/04-export-0.jpg")}
              alt="Illustration of a child playing with blocks, surrounded by meal, sleep, learning and mood cards"
            />
            <div className="landing-day-card">
              <span className="landing-day-icon">
                <Icon name="leaf" size={24} />
              </span>
              <div>
                <small>THEIR DAY, SHARED WITH YOU</small>
                <strong>Meals. Rest. Little discoveries.</strong>
                <span>Every update tells a part of the story.</span>
              </div>
            </div>
            <span className="landing-art-flower" aria-hidden="true">
              ✳
            </span>
          </motion.div>
        </section>
        <div className="landing-ribbon">
          <span>Less paperwork.</span>
          <span className="ribbon-star">✳</span>
          <span>More shared moments.</span>
          <span className="ribbon-star">✳</span>
          <span>A calmer kind of connected.</span>
        </div>
        <section id="features" className="landing-section">
          <motion.div className="landing-section-heading" {...reveal}>
            <span className="landing-eyebrow">THE EVERYDAY, MADE EASIER</span>
            <h2>
              Good care starts
              <br />
              with staying in the loop.
            </h2>
            <p>
              The details that matter, in one thoughtful place. So families feel
              included and your team can focus on the children.
            </p>
          </motion.div>
          <div className="landing-feature-grid">
            {[
              [
                "file",
                "A window into their day",
                "Meals, rest, play and mood, brought together in a daily report families can return to.",
                "sage",
              ],
              [
                "message",
                "A conversation that keeps going",
                "Messages, center announcements and upcoming events connect home and daycare.",
                "peach",
              ],
              [
                "shield",
                "A more considered goodbye",
                "Authorized guardians, staff identity checks and recorded pickup help your team follow a clear process.",
                "butter",
              ],
            ].map(([icon, title, body, color], i) => (
              <motion.article
                {...reveal}
                transition={{ duration: 0.4, delay: reduce ? 0 : i * 0.06 }}
                className={"landing-feature " + color}
                key={title}
              >
                <div className="landing-feature-icon">
                  <Icon name={icon} size={27} />
                </div>
                <h3>{title}</h3>
                <p>{body}</p>
                <span className="landing-feature-index">0{i + 1}</span>
              </motion.article>
            ))}
          </div>
        </section>
        <section id="how-it-works" className="landing-how landing-section">
          <motion.div className="landing-how-intro" {...reveal}>
            <span className="landing-eyebrow">
              ONE DAY. ONE CONNECTED TEAM.
            </span>
            <h2>
              From drop-off
              <br />
              to “see you tomorrow.”
            </h2>
            <p>
              Different people, one shared rhythm. Each account opens the tools
              that belong to its role.
            </p>
            <a className="landing-text-link" href="/staff">
              Open the caregiver workspace <span>↗</span>
            </a>
          </motion.div>
          <div className="landing-steps">
            {[
              [
                "01",
                "A welcoming start",
                "Your team records attendance and keeps care instructions close at hand.",
              ],
              [
                "02",
                "The little things, remembered",
                "Caregivers share reports and health observations. Families check in on the day.",
              ],
              [
                "03",
                "A thoughtful handover",
                "Staff check an approved guardian’s identity before recording pickup.",
              ],
            ].map(([n, title, body]) => (
              <motion.article {...reveal} key={n}>
                <span>{n}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </motion.article>
            ))}
          </div>
        </section>
        <section id="packages" className="landing-section">
          <span className="landing-eyebrow">A PACKAGE FOR YOUR CENTER</span>
          <h2>Choose your package. Start with a free trial.</h2>
          <p>Compare capacity and renewal terms before applying. Your selected package follows you into setup.</p>
          {catalogLoading?<p role="status">Loading current packages…</p>:catalogError?<div role="alert"><p>{catalogError}</p><button onClick={loadPackages}>Retry packages</button></div>:offers.length?<PackageCards offers={offers} cycle={form.billingCycle} onCycle={billingCycle=>setForm(prev=>({...prev,billingCycle}))} onChoose={openRegisterModal}/>:<p>No packages are accepting applications right now. Please check again later.</p>}
        </section>
        <section className="landing-section landing-invite">
          <motion.div {...reveal}>
            <span className="landing-eyebrow">A PLACE FOR EVERYONE</span>
            <h2>
              Your center. Your families.
              <br />A little more connected.
            </h2>
            <p>
              Choose a package and apply for your daycare’s workspace. Once approved, your team can start the included free trial.
            </p>
            <button
              className="saas-btn saas-btn-primary"
              onClick={() => document.getElementById("packages")?.scrollIntoView({behavior:reduce?"auto":"smooth"})}
            >
              Apply for your center <Icon name="arrow" size={18} />
            </button>
          </motion.div>
          <span aria-hidden="true" className="landing-invite-flower">
            ✳
          </span>
        </section>
        <section id="questions" className="landing-section landing-faq">
          <div>
            <span className="landing-eyebrow">A FEW HELPFUL ANSWERS</span>
            <h2>
              Before you
              <br />
              come on in.
            </h2>
          </div>
          <div>
            {[
              [
                "I’m a parent. How do I join?",
                "Your daycare administrator creates your account and links you to your child. Use Parent sign in when your daycare gives you access.",
              ],
              [
                "What can caregivers access?",
                "Caregivers use their assigned-child and shift workspace for attendance, reporting and family communication. Daycare administrators manage enrollment and team access.",
              ],
              [
                "Can we use the daycare store?",
                "Families can place supply orders and pay at the daycare. Online payments are not available yet.",
              ],
              [
                "How does pickup verification work?",
                "Staff check an authorized guardian’s identity and record an approved manual verification. Biometric device verification is not available yet.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <a className="saas-brand" href="/">
          <img src={logo} alt="" />
          <strong>Ankelba</strong>
        </a>
        <p>A closer connection to their day.</p>
        <nav aria-label="Footer">
          <a href="/app">Families</a>
          <a href="/staff">Caregivers</a>
          <a href="/admin">Daycare teams</a>
          <a href="/application-status">Application status</a>
        </nav>
        <small>© 2026 Ankelba</small>
      </footer>
      {/* Daycare Self-Registration Modal */}
      {modalOpen && (
        <Modal
          title="Bring your daycare to Ankelba"
          onClose={() => setModalOpen(false)}
        >
          <div className="saas-modal-content">
            {successResult ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div
                  style={{
                    display: "inline-flex",
                    padding: 16,
                    borderRadius: "50%",
                    background: "#eef6f2",
                    color: "#417B61",
                    marginBottom: 16,
                  }}
                >
                  <Icon name="checkCircle" size={44} />
                </div>
                <h2
                  style={{
                    fontFamily: "Quicksand_700Bold",
                    fontSize: 26,
                    color: "var(--navy)",
                    marginBottom: 12,
                  }}
                >
                  Application Submitted Successfully!
                </h2>
                <p
                  style={{
                    color: "var(--muted)",
                    fontSize: 15,
                    lineHeight: 1.6,
                    maxWidth: 500,
                    margin: "0 auto 24px",
                  }}
                >
                  Thank you for applying to join Ankelba,{" "}
                  <strong>{successResult.name}</strong>! Your application is in
                  review. Your selected package’s free trial starts after approval. Use your administrator credentials to check the application status.
                </p>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    gap: 14,
                    flexWrap: "wrap",
                  }}
                >
                  <a className="saas-btn saas-btn-primary" href="/application-status">Application under review · Check status</a>
                  <button
                    className="saas-btn saas-btn-accent"
                    onClick={() => {
                      setModalOpen(false);
                      navigateTo("/admin");
                    }}
                  >
                    Daycare Login
                  </button>

                </div>
              </div>
            ) : (
              <div>
                <h2
                  style={{
                    fontFamily: "Quicksand_700Bold",
                    fontSize: 24,
                    color: "var(--navy)",
                    margin: "0 0 6px",
                  }}
                >
                  Register Your Daycare Center
                </h2>
                <p
                  style={{
                    color: "var(--muted)",
                    fontSize: 14,
                    margin: "0 0 24px",
                  }}
                >
                  Apply with your selected package. Review starts after submission; the trial starts after approval.
                </p>

                {error && (
                  <div
                    style={{
                      background: "#fdf3f0",
                      color: "#c0392b",
                      padding: "12px 16px",
                      borderRadius: 10,
                      marginBottom: 20,
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Icon name="alert" size={16} /> <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleRegisterSubmit}>
                  <div className="saas-form-grid">
                    <div className="saas-form-group full">
                      <label
                        htmlFor="register-daycareName"
                        className="saas-form-label"
                      >
                        Daycare Center Name *
                      </label>
                      <input
                        id="register-daycareName"
                        className="saas-form-input"
                        placeholder="e.g. Blossom Star Childcare"
                        value={form.daycareName}
                        onChange={(e) =>
                          setForm({ ...form, daycareName: e.target.value })
                        }
                        required
                      />
                    </div>

                    <div className="saas-form-group">
                      <label
                        htmlFor="register-licenseNumber"
                        className="saas-form-label"
                      >
                        Official License Number
                      </label>
                      <input
                        id="register-licenseNumber"
                        className="saas-form-input"
                        placeholder="e.g. ETH-DC-2026-442"
                        value={form.licenseNumber}
                        onChange={(e) =>
                          setForm({ ...form, licenseNumber: e.target.value })
                        }
                      />
                    </div>

                    <div className="saas-form-group full journey">
                      <div className="j-panel"><strong>Selected package: {chosen?.name}</strong><p>{form.billingCycle==='annual'?'Annual':'Monthly'} billing · Up to {chosen?.max_children} active children · {chosen?.trial_days}-day trial after approval</p><p>{priceLabel(chosen?.[form.billingCycle==='annual'?'annual_price':'monthly_price'],form.billingCycle)}</p><small>No automatic charges. Manual renewal after the trial. Core care and safety features are included.</small><p><button type="button" onClick={()=>{setModalOpen(false);void loadPackages();document.getElementById('packages')?.scrollIntoView();}}>Change package</button></p></div>
                    </div>

                    <div className="saas-form-group">
                      <label
                        htmlFor="register-contactEmail"
                        className="saas-form-label"
                      >
                        Center Contact Email *
                      </label>
                      <input
                        id="register-contactEmail"
                        type="email"
                        className="saas-form-input"
                        placeholder="info@daycare.com"
                        value={form.contactEmail}
                        onChange={(e) =>
                          setForm({ ...form, contactEmail: e.target.value })
                        }
                        required
                      />
                    </div>

                    <div className="saas-form-group">
                      <label
                        htmlFor="register-contactPhone"
                        className="saas-form-label"
                      >
                        Center Contact Phone
                      </label>
                      <input
                        id="register-contactPhone"
                        className="saas-form-input"
                        placeholder="+251 91 123 4567"
                        value={form.contactPhone}
                        onChange={(e) =>
                          setForm({ ...form, contactPhone: e.target.value })
                        }
                      />
                    </div>

                    <div className="saas-form-group full">
                      <label
                        htmlFor="register-address"
                        className="saas-form-label"
                      >
                        Physical Address / City
                      </label>
                      <input
                        id="register-address"
                        className="saas-form-input"
                        placeholder="Bole Sub-City, Addis Ababa, Ethiopia"
                        value={form.address}
                        onChange={(e) =>
                          setForm({ ...form, address: e.target.value })
                        }
                      />
                    </div>

                    <div
                      className="saas-form-group full"
                      style={{
                        borderTop: "1px solid var(--line)",
                        paddingTop: 16,
                        marginTop: 8,
                      }}
                    >
                      <strong
                        style={{
                          display: "block",
                          fontSize: 15,
                          color: "var(--navy)",
                          marginBottom: 12,
                        }}
                      >
                        Primary Administrator Account
                      </strong>
                    </div>

                    <div className="saas-form-group full">
                      <label
                        htmlFor="register-adminName"
                        className="saas-form-label"
                      >
                        Director / Administrator Full Name *
                      </label>
                      <input
                        id="register-adminName"
                        className="saas-form-input"
                        placeholder="e.g. Tigist Haile"
                        value={form.adminName}
                        onChange={(e) =>
                          setForm({ ...form, adminName: e.target.value })
                        }
                        required
                      />
                    </div>

                    <div className="saas-form-group">
                      <label
                        htmlFor="register-adminEmail"
                        className="saas-form-label"
                      >
                        Admin Email *
                      </label>
                      <input
                        id="register-adminEmail"
                        type="email"
                        className="saas-form-input"
                        placeholder="director@daycare.com"
                        value={form.adminEmail}
                        onChange={(e) =>
                          setForm({ ...form, adminEmail: e.target.value })
                        }
                        required
                      />
                    </div>

                    <div className="saas-form-group">
                      <label
                        htmlFor="register-adminPassword"
                        className="saas-form-label"
                      >
                        Admin Password *
                      </label>
                      <input
                        id="register-adminPassword"
                        type="password"
                        className="saas-form-input"
                        placeholder="Create a strong password"
                        value={form.adminPassword}
                        onChange={(e) =>
                          setForm({ ...form, adminPassword: e.target.value })
                        }
                        required
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 24,
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 12,
                    }}
                  >
                    <button
                      type="button"
                      className="saas-btn saas-btn-ghost"
                      onClick={() => setModalOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="saas-btn saas-btn-accent"
                      disabled={loading}
                    >
                      {loading
                        ? "Submitting Application..."
                        : "Submit Application for Approval"}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
