import React from "react";
import "./download.css";

const logo = require("../../design/figma-exports/ankelba-symbol.png");

export default function DownloadPage() {
  return (
    <div className="download-page">
      <header className="download-header">
        <a href="/" className="download-brand">
          <img src={logo} alt="Ankelba Emblem" className="download-brand-logo" />
          <div className="download-brand-text">
            <strong>Ankelba</strong>
            <span>NURTURE • CONNECT • SAFEGUARD</span>
          </div>
        </a>
        <div className="download-nav-actions">
          <a href="/" className="download-nav-link">Home</a>
          <a href="/admin/login" className="download-nav-btn">Staff Sign In</a>
        </div>
      </header>

      <main className="download-main">
        {/* Hero Section */}
        <section className="download-hero">
          <div className="download-hero-content">
            <span className="download-tag">Mobile Application • Android</span>
            <h1 className="download-hero-title">
              Everyday moments and child safety, right in your pocket.
            </h1>
            <p className="download-hero-desc">
              The Ankelba Parent App provides registered guardians with direct daily activity reports,
              real-time notifications, dietary and nap logs, biometric pickup verification, and secure caregiver messaging.
            </p>
            <div className="download-action-group">
              <a
                href="/Ankelba-Parent-v1.0.0.apk"
                download="Ankelba-Parent-v1.0.0.apk"
                className="btn-download-primary"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download Android APK
              </a>
              <a href="/" className="btn-download-secondary">
                Return to Daycare Portal
              </a>
            </div>
          </div>

          <aside className="download-specs-card">
            <h3 className="download-specs-heading">Technical Specifications</h3>
            <div className="download-spec-row">
              <span className="download-spec-label">Package Name</span>
              <span className="download-spec-value">com.ankelba.app</span>
            </div>
            <div className="download-spec-row">
              <span className="download-spec-label">Version</span>
              <span className="download-spec-value">1.0.0 (Release)</span>
            </div>
            <div className="download-spec-row">
              <span className="download-spec-label">Package Size</span>
              <span className="download-spec-value">~84 MB</span>
            </div>
            <div className="download-spec-row">
              <span className="download-spec-label">Target Architecture</span>
              <span className="download-spec-value">ARM64 & x86_64</span>
            </div>
            <div className="download-spec-row">
              <span className="download-spec-label">Compatibility</span>
              <span className="download-spec-value">Android 8.0+</span>
            </div>
            <div className="download-spec-row">
              <span className="download-spec-label">Security</span>
              <span className="download-spec-value">TLS 1.3 / Verified</span>
            </div>
          </aside>
        </section>

        {/* Feature Grid */}
        <section className="download-features-grid">
          <div className="feature-box">
            <div className="feature-box-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <h3 className="feature-box-title">Daily Activity Reporting</h3>
            <p className="feature-box-desc">
              Receive verified logs of meals, nap times, sensory activities, learning milestones, and caregiver observations.
            </p>
          </div>

          <div className="feature-box">
            <div className="feature-box-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <h3 className="feature-box-title">Guardian Pickup Verification</h3>
            <p className="feature-box-desc">
              Manage authorized adult guardians and monitor biometric identity matching during frontdesk child release.
            </p>
          </div>

          <div className="feature-box">
            <div className="feature-box-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <h3 className="feature-box-title">Real-Time Attendance & Alerts</h3>
            <p className="feature-box-desc">
              Get immediate push notifications upon check-in, check-out, health observations, and center-wide announcements.
            </p>
          </div>
        </section>

        {/* Installation Instructions */}
        <section className="download-instructions">
          <h2 className="instructions-title">Installation Guide</h2>
          <p className="instructions-subtitle">Three simple steps to install the Ankelba Parent App on your Android device.</p>
          <div className="instructions-steps">
            <div className="instruction-step">
              <span className="step-num">1</span>
              <div className="step-content">
                <h4>Download the Package</h4>
                <p>Click the download button above to save the official APK package to your smartphone.</p>
              </div>
            </div>

            <div className="instruction-step">
              <span className="step-num">2</span>
              <div className="step-content">
                <h4>Allow Installation</h4>
                <p>When prompted by your browser, tap Settings and allow installation from this source.</p>
              </div>
            </div>

            <div className="instruction-step">
              <span className="step-num">3</span>
              <div className="step-content">
                <h4>Sign In</h4>
                <p>Launch the app and log in using your registered parent credentials assigned by your daycare center.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="download-footer">
        <span>© {new Date().getFullYear()} Ankelba Daycare Platform. All rights reserved.</span>
        <span>HiLCoE Senior Project Evaluation Release</span>
      </footer>
    </div>
  );
}

