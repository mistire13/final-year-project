import React, { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { apiError, portalApi } from "../portal/api";
import { Icon } from "../portal/ui.web";
import { Cycle, PackageOffer, packageBenefits, offerPrice, packageComparisonRows, packageComparisonValue } from "../portal/subscriptions";
import HeroAtmosphere from "./HeroAtmosphere.web";
import PublicNavMenu from "./PublicNavMenu.web";
import "./landing.css";
import "./pricing.css";

const logo = require("../../design/figma-exports/ankelba-symbol.png");

export type PricingPageProps = {
  onChoose: (offer: PackageOffer, cycle: Cycle) => void;
  checkout?: React.ReactNode;
  selectedTerms?: { offer: PackageOffer; cycle: Cycle };
  onBackToPlans?: () => void;
  checkoutStage?: "payment" | "application" | "submitted";
};

const periods: { code: Cycle; name: string; months: number; description: string; icon: string }[] = [
  { code: "monthly", name: "Monthly", months: 1, description: "Pay for one month of access.", icon: "leaf" },
  { code: "six_month", name: "6 months", months: 6, description: "Pay once for six months of access.", icon: "calendar" },
  { code: "annual", name: "Annual", months: 12, description: "Pay once for twelve months of access.", icon: "sparkles" },
];

function amount(value: string | null | undefined) {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function birr(value: number) {
  return value.toLocaleString("en-ET", { maximumFractionDigits: 2 });
}

function PlanArtwork({ premium }: { premium: boolean }) {
  return <div className={`pricing-plan-art ${premium ? "pricing-plan-art-premium" : ""}`} aria-hidden="true">
    <div className="pricing-art-orbit" />
    <span className="pricing-art-leaf"><Icon name="leaf" size={27} /></span>
    <span className="pricing-art-heart"><Icon name="heart" size={22} /></span>
    <span className="pricing-art-spark"><Icon name="sparkles" size={25} /></span>
    <div className="pricing-art-house"><Icon name="building" size={43} /><span /><span /></div>
  </div>;
}

export default function PricingPage({ onChoose, checkout, selectedTerms, onBackToPlans, checkoutStage = "payment" }: PricingPageProps) {
  const reduce = useReducedMotion();
  const [offers, setOffers] = useState<PackageOffer[]>([]);
  const [selectedCode, setSelectedCode] = useState<PackageOffer["code"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const contentHeading = useRef<HTMLHeadingElement>(null);
  const contentSection = useRef<HTMLElement>(null);
  const inCheckout = checkout != null;
  const selected = offers.find(offer => offer.code === selectedCode);
  const stage = inCheckout ? (checkoutStage === "payment" ? 2 : 3) : selected ? 1 : 0;
  const focusStage = inCheckout ? `${stage}:${checkoutStage}` : String(stage);
  const previousStage = useRef(focusStage);

  useEffect(() => {
    if (inCheckout) return;
    let active = true;
    setLoading(true);
    setError("");
    portalApi.packages().then((catalog: PackageOffer[]) => {
      if (active) setOffers(catalog.filter(offer => offer.code === "standard" || offer.code === "premium").sort((a, b) => a.code === b.code ? 0 : a.code === "standard" ? -1 : 1));
    }).catch(reason => { if (active) setError(apiError(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, inCheckout]);

  useEffect(() => {
    if (previousStage.current === focusStage) return;
    previousStage.current = focusStage;
    const heading = contentHeading.current;
    if (!heading) return;
    heading.focus({ preventScroll: true });
    contentSection.current?.scrollIntoView({ behavior: reduce ? "instant" : "smooth", block: "start" });
  }, [focusStage, reduce]);

  const summary = selectedTerms?.offer ?? selected;
  const activePeriod = periods.find(period => period.code === selectedTerms?.cycle);
  const summaryAmount = selectedTerms ? amount(offerPrice(selectedTerms.offer, selectedTerms.cycle)) : null;

  return <div className="ankelba-home-container ankelba-pricing-page">
    <a className="pricing-skip-link" href="#pricing-content">Skip to plans</a>
    <header className="ankelba-home-nav pricing-nav">
      <a className="ankelba-home-brand" href="/" aria-label="Ankelba Home">
        <img src={logo} alt="" className="ankelba-home-brand-logo" />
        <div className="ankelba-home-brand-text"><strong>Ankelba</strong><span>Nurture · Connect · Safeguard</span></div>
      </a>
      <PublicNavMenu activePage="pricing" />
      <a className="btn-pill btn-pill-secondary pricing-signin" href="/admin/login">Staff sign in <Icon name="arrow" size={16} /></a>
    </header>

    <main>
      <section className={`pricing-hero ${inCheckout ? "pricing-hero-compact" : ""}`} aria-labelledby="pricing-title">
        <HeroAtmosphere />
        <motion.div className="pricing-hero-content" initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55 }}>
          <h1 id="pricing-title">Plans &amp; <span>pricing</span></h1>

        </motion.div>
        <div className="pricing-hero-wave" aria-hidden="true"><svg viewBox="0 0 1440 60" preserveAspectRatio="none"><path d="M0 22C240 76 480-8 720 26s480 30 720-10v44H0Z" fill="var(--ankelba-cream-soft)" /></svg></div>
      </section>

      <div className="pricing-journey">
        <ol className="pricing-progress" aria-label="Registration progress">
          {["Choose a package", "Pick your period", "Payment", "Application"].map((step, index) => <li key={step} className={index === stage ? "current" : index < stage ? "complete" : ""} aria-current={index === stage ? "step" : undefined}>
            <span className="pricing-progress-number">{index < stage ? <Icon name="check" size={15} /> : `0${index + 1}`}</span><span>{step}</span>
          </li>)}
        </ol>

        <section ref={contentSection} id="pricing-content" className="pricing-content" aria-labelledby="pricing-content-title">
          {inCheckout ? <>
            <div className="pricing-section-heading pricing-checkout-heading">
              <h2 id="pricing-content-title" ref={contentHeading} tabIndex={-1}>{checkoutStage === "submitted" ? "Application submitted" : checkoutStage === "application" ? "Daycare application" : "Payment"}</h2>
              <p>{checkoutStage === "submitted" ? "Track your application while the platform team reviews it." : checkoutStage === "application" ? "Your payment is confirmed. Complete your daycare and director details below." : "Review your selection, then follow the payment instructions below."}</p>
            </div>
            {summary && <div className="pricing-selection-summary">
              <span className={`pricing-summary-icon ${summary.code}`}><Icon name={summary.code === "premium" ? "sparkles" : "leaf"} size={23} /></span>
              <div><strong>{summary.name}</strong><span>{activePeriod?.name ?? "Your selected package"}{summary.max_children > 0 ? ` · Up to ${summary.max_children} active children` : ""}</span></div>
              {summaryAmount != null && <strong className="pricing-summary-price">{birr(summaryAmount)} <small>ETB</small></strong>}
              {onBackToPlans && <button className="pricing-text-link" type="button" onClick={onBackToPlans}>Change plan <Icon name="arrow" size={15} /></button>}
            </div>}
            <div className="pricing-checkout">{checkout}</div>
          </> : selected ? <>
            <div className="pricing-selection-summary">
              <span className={`pricing-summary-icon ${selected.code}`}><Icon name={selected.code === "premium" ? "sparkles" : "leaf"} size={23} /></span>
              <div><strong>{selected.name}</strong><span>Up to {selected.max_children} active children · All core features included</span></div>
              <button type="button" className="pricing-text-link" onClick={() => setSelectedCode(null)}>Change package <Icon name="arrow" size={15} /></button>
            </div>
            <div className="pricing-section-heading">
              <h2 id="pricing-content-title" ref={contentHeading} tabIndex={-1}>Choose a billing period</h2>

            </div>
            <div className="pricing-period-grid">
              {periods.map((period, index) => {
                const total = amount(offerPrice(selected, period.code));
                const monthly = amount(selected.monthly_price);
                const baseline = monthly != null ? Math.round(monthly * period.months * 100) / 100 : null;
                const saving = total != null && baseline != null && period.months > 1 && baseline > total ? Math.round((baseline - total) * 100) / 100 : 0;
                const percent = saving > 0 && baseline ? Math.floor(saving / baseline * 100) : 0;
                return <motion.article key={`${selected.code}-${period.code}`} className={`pricing-period-card pricing-period-${period.code}`} initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35, delay: index * .07 }} aria-labelledby={`period-${period.code}`}>
                  <div className="pricing-period-top"><span className="pricing-period-icon"><Icon name={period.icon} size={28} /></span></div>
                  <h3 id={`period-${period.code}`}>{period.name}</h3><p className="pricing-card-description">{period.description}</p>
                  <div className="pricing-period-price">
                    {total != null ? <><div className="pricing-previous-price">{saving > 0 ? <><s>{birr(baseline!)} ETB</s><span className="pricing-saving">{percent > 0 ? `Save ${percent}%` : `Save ${birr(saving)} ETB`}</span></> : <span>One-time payment</span>}</div><strong>{birr(total)} <small>ETB</small></strong><span className="pricing-price-caption">Total for {period.months === 1 ? "1 month" : `${period.months} months`}</span>{saving > 0 && <span className="pricing-savings-context">Compared with monthly billing</span>}</> : <><strong className="pricing-rate-unavailable">Price unavailable</strong><span className="pricing-price-caption">This period isn’t available yet.</span></>}
                  </div>
                  <ul className="pricing-period-details"><li><Icon name="checkCircle" size={18} /> All {selected.name} features</li><li><Icon name="people" size={18} /> Up to {selected.max_children} active children</li><li><Icon name="calendar" size={18} /> {period.months === 1 ? "1 month" : `${period.months} months`} of access</li>{total != null && period.months > 1 && <li><Icon name="leaf" size={18} /> {birr(total / period.months)} ETB / month equivalent</li>}</ul>
                  <div className="pricing-period-bottom"><button type="button" className={`btn-pill ${period.code === "annual" ? "btn-pill-primary" : "btn-pill-secondary"}`} disabled={total == null || !selected.available} onClick={() => onChoose(selected, period.code)}>{total == null || !selected.available ? `${period.name} unavailable` : `Continue with ${period.name}`}<Icon name="arrow" size={18} /></button></div>
                </motion.article>;
              })}
            </div>
            <div className="pricing-reassurance"><Icon name="shield" size={21} /><p>Your paid period starts when your application is approved. Renew when you’re ready — there are no automatic charges.</p></div>
          </> : <>
            <div className="pricing-section-heading">
              <h2 id="pricing-content-title" ref={contentHeading} tabIndex={-1}>Compare packages</h2>

            </div>
            {loading ? <div className="pricing-state" role="status"><h3>Loading packages…</h3></div> : error ? <div className="pricing-state" role="alert"><span className="pricing-state-icon"><Icon name="refresh" size={28} /></span><h3>We couldn’t load the plans.</h3><p>{error}</p><button className="btn-pill btn-pill-primary" type="button" onClick={() => setAttempt(value => value + 1)}>Try again <Icon name="refresh" size={17} /></button></div> : offers.length === 0 ? <div className="pricing-state"><h3>Subscriptions are not available yet.</h3><p>Please check back later.</p></div> : <div className="pricing-package-grid">
              {offers.map((offer, index) => {
                const monthly = amount(offer.monthly_price);
                return <motion.article key={offer.code} className={`pricing-package-card pricing-package-${offer.code}`} initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .4, delay: index * .08 }} aria-labelledby={`package-${offer.code}`}>
                <div className="pricing-package-intro"><div><h3 id={`package-${offer.code}`}>{offer.name}</h3><p>{offer.description}</p></div><PlanArtwork premium={offer.code === "premium"} /></div>
                <div className="pricing-package-price">{monthly != null ? <p><strong>{birr(monthly)}</strong><span>ETB / month</span></p> : <strong className="pricing-monthly-unavailable">Monthly price unavailable</strong>}<span>Up to {offer.max_children} active children</span></div>
                <p className="pricing-features-heading">Included in {offer.name}</p>
                <ul className="pricing-feature-list">{packageBenefits(offer).map(feature => <li key={feature}><span><Icon name="check" size={14} /></span>{feature}</li>)}</ul>
                <button type="button" className={`btn-pill ${offer.code === "premium" ? "pricing-premium-cta" : "btn-pill-primary"}`} onClick={() => setSelectedCode(offer.code)}>Choose {offer.name}<Icon name="arrow" size={18} /></button>
                <p className="pricing-package-note">Choose your payment period next</p>
              </motion.article>;
              })}
            </div>}
            {!loading&&!error&&offers.length>0&&<section className="pricing-comparison" aria-labelledby="pricing-comparison-title">
              <div className="pricing-section-heading"><h2 id="pricing-comparison-title">Compare every feature</h2></div>
              <div className="pricing-comparison-scroll" role="region" aria-label="Standard and Plus feature comparison" tabIndex={0}>
                <table><caption>Features are the same across monthly, six-month and annual billing within each package.</caption><thead><tr><th scope="col">Feature</th>{offers.map(offer=><th scope="col" key={offer.code}>{offer.name}</th>)}</tr></thead>
                  <tbody>{packageComparisonRows.map(row=><tr key={row.key}><th scope="row">{row.label}</th>{offers.map(offer=>{const value=packageComparisonValue(offer,row);return <td key={offer.code} className={value==='Included'?'is-included':value==='Not included'?'is-unavailable':''}>{value==='Included'&&<Icon name="check" size={16}/>}<span>{value}</span></td>;})}</tr>)}</tbody>
                </table>
              </div>
              <p className="pricing-comparison-notes">Prices and child limits are set by the super admin. Care-fee bank receipts are supported in both packages after the daycare configures its receiving account; unavailable or unmatched verification requires daycare review. Existing orders, invoices and receipts remain available after a downgrade. Email reminders require configured delivery and parent consent.</p>
            </section>}
          </>}
        </section>

        {!inCheckout && <section className="pricing-faq" aria-labelledby="pricing-faq-title"><div><h2 id="pricing-faq-title">Subscription questions</h2></div><div className="pricing-faq-items"><details><summary>What’s the difference between Standard and Plus?<Icon name="plus" size={18} /></summary><p>Both include daily care, authorized pickup, health/incident reports, family communication and manual billing. Plus adds the daycare shop, comparative management reports, scheduled monthly billing and recurring front-desk attendance/pickup shifts. Child limits and prices are shown from the super admin’s configuration above.</p></details><details><summary>When does my subscription start?<Icon name="plus" size={18} /></summary><p>Your paid period starts after your daycare application is approved. Complete payment first, then submit your daycare details for review.</p></details><details><summary>Will I be charged automatically?<Icon name="plus" size={18} /></summary><p>No. You initiate each renewal payment. Choose a monthly, six-month or annual period when you subscribe. A verified next-period package change starts on its agreed date; your current paid features remain available until then.</p></details></div></section>}
      </div>
    </main>

    <footer className="pricing-footer"><a className="ankelba-home-brand" href="/"><img src={logo} alt="" className="ankelba-home-brand-logo" /><div className="ankelba-home-brand-text"><strong>Ankelba</strong><span>Daycare management</span></div></a><div><a href="/">Home</a><a href="/application-status">Application status</a><a href="/admin/login">Staff sign in</a></div></footer>
  </div>;
}
