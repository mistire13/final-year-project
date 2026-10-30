import React, { useState } from "react";
import { Icon } from "../portal/ui.web";
import "./landing-footer.css";

const logo = require("../../design/figma-exports/ankelba-symbol.png");

export default function LandingFooter({ onRegister, onBackToTop }: { onRegister: (daycareName: string) => void; onBackToTop: () => void }) {
  const [daycareName, setDaycareName] = useState("");
  return (
    <footer className="ankelba-site-footer" aria-label="Ankelba footer">
      <div className="footer-wordmark" aria-hidden="true"><img src={logo} alt="" /><span>Ankelba</span></div>
      <div className="footer-surface">
        <div className="footer-main">
          <div className="footer-intro"><span className="footer-brand-line" aria-hidden="true" /><h2>Stay connected<br /> to their day.</h2><p>Daily reports, caregiver messages and pickup information in one place.</p></div>
          <nav className="footer-links" aria-label="Explore Ankelba"><h3>Explore</h3><a href="#why-ankelba">Why Ankelba</a><a href="#features">Features</a><a href="#a-day-together">How it works</a><a href="#for-everyone">Families & staff</a><a href="#questions">Common questions</a></nav>
          <nav className="footer-links" aria-label="Ankelba access"><h3>Access</h3><a href="/app">Parent app</a><a href="/admin/login">Staff sign in</a><a href="/application-status">Application status</a></nav>
          <div className="footer-registration"><div className="footer-color-dots" aria-hidden="true"><span /><span /><span /></div><h3>Bring Ankelba to your daycare.</h3><p>Start with your daycare’s name. Add your center and contact details next.</p><form onSubmit={event => { event.preventDefault(); onRegister(daycareName.trim()); }}><label htmlFor="footer-daycare-name">Daycare name</label><div className="footer-form-field"><input id="footer-daycare-name" name="organization" autoComplete="organization" placeholder="Your daycare’s name" required maxLength={200} value={daycareName} onChange={event => setDaycareName(event.target.value)} /><button type="submit">Continue <Icon name="arrow" size={19} /></button></div></form></div>
        </div>
        <div className="footer-bottom"><p>© {new Date().getFullYear()} Ankelba. All rights reserved.</p><div><a href="/super-admin">Platform console</a><button type="button" onClick={onBackToTop}>Back to top <span><Icon name="arrow" size={16} /></span></button></div></div>
      </div>
    </footer>
  );
}
