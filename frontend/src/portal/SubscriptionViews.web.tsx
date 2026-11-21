import React, { useEffect, useRef, useState } from 'react';
import { operatorApi, portalApi, apiError } from './api';
import { Button, Card } from './ui.web';
import { Cycle, PackageOffer, dateLabel, offerPrice, priceLabel } from './subscriptions';
import ReceiptReference from './ReceiptReference.web';
import './journey.css';

function History({ rows = [] }: { rows?: any[] }) {
  return <section><h3>Subscription history</h3>{!rows.length ? <p>No changes recorded yet.</p> : <ol className="j-history">{rows.map(e => <li key={e.id}><strong>{String(e.action).replaceAll('_', ' ')}</strong><p>{e.reason}</p>{e.details?.payment_reference && <p>Payment reference: {e.details.payment_reference}{e.details.amount != null && ` · ${e.details.amount} ${e.details.currency || ''}`}</p>}<small>{dateLabel(e.created_at)} · {e.actor_name || 'Platform team'}</small></li>)}</ol>}</section>;
}

const TIER_PLUS_ITEMS: [string, string][] = [
  ['shop', 'Daycare shop, orders and inventory control'],
  ['business_analytics', 'Comparative business reports and CSV/PDF exports'],
  ['billing_automation', 'Scheduled monthly invoices and payment reminders'],
  ['staff_scheduling', 'Repeating attendance/pickup shifts, leave and substitutes'],
];

const TIER_CORE_ITEMS = [
  'Child & guardian profiles and classroom groups',
  'Daily attendance check-in and verified pickup checkout',
  'Daily care reports and health/incident alerts',
  'Parent messaging, announcements and calendar',
  'Manual care-fee invoices, payments and bank receipts',
  'Individual front-desk duties and basic analytics',
];

export function ScheduledPackageSummary({ change }: { change?: any }) {
  if (!change) return null;
  const terms = change.terms || {};
  const confirmed = ['verified', 'consumed'].includes(change.payment_status) || ['paid', 'blocked'].includes(change.status);
  return <section className="j-panel" aria-label="Scheduled package change">
    <h4>Scheduled package change</h4>
    <p>Current paid package stays in effect until {dateLabel(change.effective_at)}.</p>
    <p>{terms.name || 'Next package'}{terms.max_children != null ? ` · ${terms.max_children} children` : ''}{terms.price != null ? ` · ${priceLabel(terms.price, terms.billing_cycle)}` : ''}</p>
    <p>{confirmed ? 'Verified and held for activation' : 'Awaiting payment or verification'}{change.payment_reference ? ` · Reference ${change.payment_reference}` : ''}</p>
    {change.status === 'blocked' && <p role="alert" className="j-error">{change.blocked_reason || 'Activation needs review.'} Contact platform support before paying again.</p>}
  </section>;
}

export function renewalResultNotice(result: any): string {
  if (result?.blocked) return result.message || 'The verified payment is held while activation is reviewed. Contact support before paying again.';
  if (result?.scheduled) return 'Payment verified. Your current package stays in effect until the scheduled change.';
  return 'Renewal recorded. Your subscription details have been refreshed.';
}

export function Summary({ value, showPlanBreakdown = false }: { value: any; showPlanBreakdown?: boolean }) {
  const terms = value.subscription_terms;
  const code = (value.package_code || terms?.code || value.subscription_plan || 'standard') === 'premium' ? 'premium' : 'standard';
  const tierName = value.package_name || terms?.name || (code === 'premium' ? 'Plus' : 'Standard');
  const maxChildren = typeof value.max_children === 'number' ? value.max_children : (code === 'premium' ? 150 : 50);
  const activeChildren = typeof value.active_children_count === 'number' ? value.active_children_count : null;
  const usedPct = activeChildren != null && maxChildren > 0 ? Math.min(100, Math.round((activeChildren / maxChildren) * 100)) : null;
  const endMs = value.subscription_ends_at ? Date.parse(value.subscription_ends_at) : NaN;
  const expired = Number.isFinite(endMs) ? endMs <= Date.now() : value.effective_status === 'expired';
  const features = value.features || {};
  return <><div className="j-summary">
    <div><small>Package and capacity</small><strong>{tierName} · {activeChildren != null ? `${activeChildren} / ${maxChildren}` : `${maxChildren}`} children</strong>{usedPct != null && <div className="j-meter" aria-label="Child enrollment capacity usage"><div className={`j-meter-fill${usedPct >= 90 ? ' warn' : ''}`} style={{ width: `${usedPct}%` }} /></div>}</div>
    <div><small>Status</small><strong>{String(value.effective_status || value.subscription_status || 'unknown').replaceAll('_', ' ')}</strong></div>
    <div><small>Renewal price</small><strong>{priceLabel(terms?.price, value.billing_cycle)}</strong></div>
    <div><small>Paid through · Addis Ababa</small><strong>{dateLabel(value.subscription_ends_at)}</strong></div>
  </div>
  {showPlanBreakdown && <div className="j-plan-grid">
    <div className="j-plan-box">
      <h4>Core workflows ({tierName})</h4>
      <ul className="j-cap-list">
        {TIER_CORE_ITEMS.map(item => <li key={item} className="j-cap-row"><span>{item}</span><span className="j-cap-state">Included</span></li>)}
      </ul>
    </div>
    <div className="j-plan-box">
      <h4>Plus tools &amp; expanded capacity (up to 150 children)</h4>
      <ul className="j-cap-list">
        {TIER_PLUS_ITEMS.map(([key, label]) => {
          const on = features[key] === true;
          const stateText = on ? 'Included' : (code === 'premium' ? (expired ? 'Paused (expired)' : 'Unavailable') : 'Plus only');
          const cls = on ? 'j-cap-state' : (code === 'premium' && expired ? 'j-cap-state paused' : 'j-cap-state locked');
          return <li key={key} className="j-cap-row"><span>{label}</span><span className={cls}>{stateText}</span></li>;
        })}
      </ul>
      {code !== 'premium' && <p className="j-muted" style={{ marginTop: 12, marginBottom: 0 }}>Your center is on Standard (up to {maxChildren} active children). To upgrade to Plus (up to 150 children plus Shop, Business Reports, Billing Automation and Shift Scheduling), contact platform support to schedule next-period terms.</p>}
    </div>
  </div>}
  {value.expiry_policy && <p>{value.expiry_policy}</p>}<ScheduledPackageSummary change={value.scheduled_change}/></>;
}

function printDaycareRecords(data: any) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to open the printable daycare archive.');
    return;
  }
  const dc = data.daycare || {};
  const staff = data.staff || [];
  const children = data.children || [];
  const guardians = data.guardians || [];
  const financials = data.financials || { invoices: [], payments: [] };

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${dc.name || 'Daycare'} - Official Archive Export</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; margin: 0; padding: 24px; font-size: 12px; line-height: 1.5; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
    .header-left h1 { font-size: 22px; margin: 0 0 4px; color: #0f172a; }
    .header-left p { margin: 2px 0; color: #475569; font-size: 13px; }
    .header-right { text-align: right; font-size: 12px; color: #64748b; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
    .stat-card strong { display: block; font-size: 20px; color: #0f172a; }
    .stat-card span { font-size: 11px; color: #64748b; text-transform: uppercase; }
    h2 { font-size: 15px; margin: 24px 0 8px; color: #1e3a8a; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11.5px; page-break-inside: auto; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    th, td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; color: #334155; }
    .footer { margin-top: 36px; border-top: 1px solid #cbd5e1; padding-top: 12px; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="background:#fef3c7;border:1px solid #fde68a;padding:12px 16px;border-radius:8px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;">
    <strong>Official Daycare Archive - Complete Operational Records</strong>
    <button onclick="window.print()" style="background:#0f172a;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;">Print / Save as PDF</button>
  </div>

  <div class="header">
    <div class="header-left">
      <h1>${dc.name || 'Daycare Center'}</h1>
      <p>License: ${dc.license_number || 'N/A'} · Contact: ${dc.phone || 'N/A'} · ${dc.contact_email || ''}</p>
      <p>Address: ${dc.address || 'Addis Ababa, Ethiopia'}</p>
    </div>
    <div class="header-right">
      <p><strong>Export Date:</strong> ${new Date(data.exported_at).toLocaleString()}</p>
      <p><strong>Subscription Plan:</strong> ${dc.subscription_plan || 'Standard'} (${dc.subscription_status || 'active'})</p>
    </div>
  </div>

  <div class="grid">
    <div class="stat-card"><strong>${staff.length}</strong><span>Staff & Caregivers</span></div>
    <div class="stat-card"><strong>${children.length}</strong><span>Enrolled Students</span></div>
    <div class="stat-card"><strong>${guardians.length}</strong><span>Linked Guardians</span></div>
    <div class="stat-card"><strong>${financials.invoices?.length || 0}</strong><span>Invoices Billed</span></div>
  </div>

  <h2>1. Staff & Caregiver Directory</h2>
  <table>
    <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th><th>Status</th></tr></thead>
    <tbody>
      ${staff.map((s: any) => `<tr><td><strong>${s.name}</strong></td><td>${s.role}</td><td>${s.email}</td><td>${s.phone || 'N/A'}</td><td>${s.status}</td></tr>`).join('') || '<tr><td colspan="5">No staff records.</td></tr>'}
    </tbody>
  </table>

  <h2>2. Enrolled Children / Students</h2>
  <table>
    <thead><tr><th>Full Name</th><th>DOB</th><th>Gender</th><th>Status</th><th>Emergency Contact</th><th>Medical Notes / Allergies</th></tr></thead>
    <tbody>
      ${children.map((c: any) => `<tr><td><strong>${c.first_name} ${c.last_name}</strong></td><td>${c.date_of_birth ? new Date(c.date_of_birth).toLocaleDateString() : 'N/A'}</td><td>${c.gender || 'N/A'}</td><td>${c.enrollment_status}</td><td>${c.emergency_contact_name || ''} ${c.emergency_contact_phone ? '(' + c.emergency_contact_phone + ')' : ''}</td><td>${[c.medical_conditions, c.allergies].filter(Boolean).join('; ') || 'None reported'}</td></tr>`).join('') || '<tr><td colspan="6">No children records.</td></tr>'}
    </tbody>
  </table>

  <h2>3. Parents & Authorized Guardians</h2>
  <table>
    <thead><tr><th>Guardian Name</th><th>Child</th><th>Relationship</th><th>Phone</th><th>Email</th><th>Pickup Authorized</th></tr></thead>
    <tbody>
      ${guardians.map((g: any) => `<tr><td><strong>${g.name}</strong></td><td>${g.child_name || 'N/A'}</td><td>${g.relationship || 'Guardian'}</td><td>${g.phone || 'N/A'}</td><td>${g.email || 'N/A'}</td><td>${g.pickup_authorized ? 'YES' : 'NO'}</td></tr>`).join('') || '<tr><td colspan="6">No guardian records.</td></tr>'}
    </tbody>
  </table>

  <h2>4. Financial Ledger (Invoices & Billing)</h2>
  <table>
    <thead><tr><th>Invoice ID</th><th>Child</th><th>Amount</th><th>Status</th><th>Due Date</th></tr></thead>
    <tbody>
      ${(financials.invoices || []).map((inv: any) => `<tr><td>#${inv.id}</td><td>${inv.child_name || 'Child #' + inv.child_id}</td><td><strong>${Number(inv.amount).toLocaleString()} ETB</strong></td><td>${inv.status}</td><td>${inv.due_date ? new Date(inv.due_date).toLocaleDateString() : 'N/A'}</td></tr>`).join('') || '<tr><td colspan="5">No invoices recorded.</td></tr>'}
    </tbody>
  </table>

  <div class="footer">
    <span>Ankelba Multi-Tenant Childcare Platform - Tenant Export Archive</span>
    <span>Generated by Daycare Administration</span>
  </div>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

export function SubscriptionNotice({ value, onOpen }: { value: any; onOpen: () => void }) {
  const end = value?.subscription_ends_at && new Date(value.subscription_ends_at).getTime();
  if (!end || !Number.isFinite(end) || end > Date.now() + 3 * 86400000) return null;
  const expired = end <= Date.now();
  const msRemaining = end - Date.now();
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));

  return (
    <div
      role="status"
      style={{
        background: expired ? "#fef2f2" : "#fffbeb",
        border: `1.5px solid ${expired ? "#f87171" : "#f59e0b"}`,
        borderRadius: 12,
        padding: "16px 20px",
        marginBottom: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span
            style={{
              background: expired ? "#ef4444" : "#f59e0b",
              color: "#fff",
              fontWeight: 800,
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 6,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {expired ? "Subscription Expired" : `Urgent: ${daysRemaining} Day${daysRemaining === 1 ? '' : 's'} Remaining`}
          </span>
          <strong style={{ color: expired ? "#991b1b" : "#92400e", fontSize: 15 }}>
            {expired ? "Your subscription period has ended." : "Platform renewal required soon"}
          </strong>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: expired ? "#7f1d1d" : "#78350f" }}>
          {expired
            ? "Renew immediately to restore full daycare administrative features. Essential child check-in and pickup remain operational."
            : `Your current billing period expires on ${dateLabel(value.subscription_ends_at)}. Please complete your renewal payment to prevent service disruption.`}
        </p>
      </div>
      <Button variant="primary" onClick={onOpen}>
        {expired ? "Renew Subscription Now" : "Review & Pay Renewal"}
      </Button>
    </div>
  );
}

export function DaycareSubscription() {
  const [value, setValue] = useState<any>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<any>(null), [provider, setProvider] = useState('cbe'), [reference, setReference] = useState(''), [suffix, setSuffix] = useState('');
  const [restartAcknowledged, setRestartAcknowledged] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<{ provider: 'telebirr' | 'cbe' | 'abyssinia'; institution: string }[]>([]);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [exporting, setExporting] = useState(false);
  useEffect(() => { let active = true; portalApi.publicPaymentSettings().then(result => { if (active) { const accounts = result.accounts.filter((account: any) => ['telebirr', 'cbe', 'abyssinia'].includes(account.provider)); setBankAccounts(accounts); setProvider(accounts[0]?.provider || ''); } }).catch(reason => { if (active) setError(apiError(reason)); }); return () => { active = false; }; }, []);
  const load = async () => {
    try {
      const summary = await portalApi.subscription(); setValue(summary);
      const recovery = window.sessionStorage.getItem('ankelba_renewal_resume');
      if (recovery) {
        const { id, token } = JSON.parse(recovery);
        const restored = { ...await portalApi.resumeRenewalIntent(id, token), token };
        window.sessionStorage.setItem(`ankelba_renewal_${summary.id}`, JSON.stringify(restored));
        window.sessionStorage.removeItem('ankelba_renewal_resume');
        setIntent(restored);
      } else {
        const saved = window.sessionStorage.getItem(`ankelba_renewal_${summary.id}`);
        if (saved) setIntent(JSON.parse(saved));
      }
    } catch (e) { setError(apiError(e)); }
  };
  useEffect(() => { void load(); }, []);
  const saveIntent = (next: any) => { setIntent(next); try { if (value?.id) window.sessionStorage.setItem(`ankelba_renewal_${value.id}`, JSON.stringify(next)); } catch {} };
  const create = async () => { setBusy(true); setError(''); try { saveIntent(await portalApi.createRenewalIntent(provider as 'telebirr'|'cbe'|'abyssinia')); } catch (e) { setError(apiError(e)); } finally { setBusy(false); } };
  const check = async (verify: boolean) => {
    setBusy(true); setError('');
    try {
      const result = verify ? await portalApi.verifyPaymentIntent(intent.id, { token: intent.token, provider: intent.terms?.recipient_provider, reference, ...(intent.terms?.recipient_provider !== 'telebirr' && suffix ? { suffix } : {}) }) : await portalApi.paymentIntentStatus(intent.id, intent.token);
      saveIntent({ ...intent, ...result, token: intent.token });
      setNotice(result.message || 'Payment is pending review. If you already paid, do not pay again.');
      if (result.status === 'verified' || result.status === 'consumed') {
        const applied = await portalApi.applyRenewalIntent(intent.id, intent.token);
        try { window.sessionStorage.removeItem(`ankelba_renewal_${value.id}`); } catch { }
        setIntent(null); setNotice(renewalResultNotice(applied)); await load();
      }
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };
  const apply = async () => { setBusy(true); setError(''); try { const applied = await portalApi.applyRenewalIntent(intent.id, intent.token); try { window.sessionStorage.removeItem(`ankelba_renewal_${value.id}`); } catch { } setIntent(null); setNotice(renewalResultNotice(applied)); await load(); } catch (e) { setError(apiError(e)); } finally { setBusy(false); } };
  const restart = async () => {
    if (!intent || !restartAcknowledged) return;
    setBusy(true); setError('');
    try {
      const current = { ...intent, ...await portalApi.paymentIntentStatus(intent.id, intent.token), token: intent.token };
      const expired = !!current.expires_at && new Date(current.expires_at).getTime() <= Date.now();
      if (['verified', 'consumed'].includes(current.status)) {
        saveIntent(current);
        setError('This payment has already been confirmed. Keep this session and contact support if it has not been applied.');
        return;
      }
      if (!['rejected', 'resolved'].includes(current.status) && !expired) {
        saveIntent(current);
        setError('This payment session is still active. You can correct the reference or refresh its status.');
        return;
      }
      try { window.sessionStorage.removeItem(`ankelba_renewal_${value.id}`); } catch { }
      setIntent(null); setReference(''); setRestartAcknowledged(false);
    } catch (e) { setError(apiError(e)); }
    finally { setBusy(false); }
  };

  const handleExportData = async (format: 'pdf' | 'json') => {
    setExporting(true);
    setError('');
    try {
      const data = await portalApi.exportDaycareData();
      if (format === 'pdf') {
        printDaycareRecords(data);
      } else {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${data.daycare?.slug || 'daycare'}_full_archive_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(apiError(err));
    } finally {
      setExporting(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!cancelReason.trim()) {
      setError('Please provide a reason for cancelling your subscription.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await portalApi.cancelSubscription({ reason: cancelReason });
      setNotice(res.message || 'Subscription successfully cancelled.');
      setCancelModalOpen(false);
      setCancelReason('');
      await load();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const expiredIntent = !!intent?.expires_at && new Date(intent.expires_at).getTime() <= Date.now();
  const mayRestart = !!intent && !['verified','consumed'].includes(intent.status) && (expiredIntent || ['rejected','resolved'].includes(intent.status));
  return <div className="journey"><Card title="Your subscription"><p>Review your package features, enrollment limit and pay for your next period.</p>{error && <p role="alert" className="j-error">{error}</p>}{notice && <p role="status">{notice}</p>}{value && <><Summary value={value} showPlanBreakdown/><label>Payment method<select value={provider} disabled={busy||!!intent} onChange={event=>setProvider(event.target.value)}><option value="">Choose a payment method</option>{bankAccounts.map(bank=><option key={bank.provider} value={bank.provider}>{bank.institution}</option>)}</select></label>{!bankAccounts.length&&<p>Configure a receiving account before starting a renewal.</p>}<Button onClick={create} disabled={busy || !!intent || ['paid','blocked'].includes(value.scheduled_change?.status) || !bankAccounts.some(bank=>bank.provider===provider)}>{value.scheduled_change ? 'Pay for scheduled package' : 'Start renewal payment'}</Button></>}</Card>
    {intent && <Card title="Renewal payment"><p>Pay {priceLabel(intent.terms?.price, intent.terms?.billing_cycle)} to {[intent.recipient_institution,intent.recipient_name,intent.recipient].filter(Boolean).join(' · ') || 'the configured receiving account'}. {intent.terms?.recipient_provider==='cbe'?'Then paste your CBE receipt link or enter your FT transaction reference.':'Then enter your transaction reference.'}</p><p role="status">Status: {String(intent.status).replaceAll('_', ' ')}</p>
      {['verified','consumed'].includes(intent.status) ? <Button disabled={busy} onClick={apply}>{intent.status === 'consumed' ? 'Refresh recorded renewal' : 'Apply verified renewal'}</Button> : mayRestart ? <div className="j-panel">
        <p>This payment session is no longer available for verification. If you already paid, do not pay again; contact the platform team with your reference.</p>
        <label><input type="checkbox" checked={restartAcknowledged} onChange={e => setRestartAcknowledged(e.target.checked)} /> I understand that starting again does not refund or transfer a previous payment.</label>
        <Button variant="secondary" disabled={busy || !restartAcknowledged} onClick={() => void restart()}>Start a new payment session</Button>
      </div> : !['telebirr', 'cbe', 'abyssinia'].includes(intent.terms?.recipient_provider) ? <p>This session uses a previous payment method. Contact the platform team for review. If you already paid, do not pay again.</p> : <form className="j-form" onSubmit={e => { e.preventDefault(); void check(true); }}>
        <p><strong>{intent.recipient_institution}</strong></p>
        <ReceiptReference id={intent.id} token={intent.token} onReference={setReference} />
        <label>{intent.terms?.recipient_provider === 'telebirr' ? 'Telebirr transaction reference' : intent.terms?.recipient_provider === 'cbe' ? 'CBE receipt link or FT reference' : 'Transaction reference or CBE receipt link'}<input required type="text" maxLength={intent.terms?.recipient_provider === 'cbe' ? 2048 : 150} value={reference} onChange={e => setReference(e.target.value)} placeholder={intent.terms?.recipient_provider === 'cbe' ? 'Paste receipt link or enter FT reference' : 'Transaction reference'} /></label>
        {intent.terms?.recipient_provider === 'abyssinia' && <><label>Account suffix (5 digits)<input inputMode="numeric" autoComplete="off" required pattern="[0-9]{5}" maxLength={5} value={suffix} onChange={event => setSuffix(event.target.value)} /></label><p>Use the account suffix required by your receipt verification details.</p></>}
        <p>Use the reference shown on your receipt. Payments that cannot be verified remain pending for operator review.</p>{busy && <p role="status">Checking the reference and matching the payment details…</p>}{intent.message && <p role="status">{intent.message}</p>}
        <div className="j-actions"><Button type="submit" disabled={busy}>Verify payment</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => void check(false)}>Refresh status</Button></div>
      </form>}</Card>}
    {value && (
      <Card title="Data Sovereignty & Subscription Management">
        <p>
          You have full ownership of your daycare records. You can download and archive your entire dataset (students, guardians, staff directory, and financial records) at any time.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <Button variant="secondary" disabled={exporting} onClick={() => void handleExportData('pdf')}>
            {exporting ? 'Generating Report…' : 'Print / Save Complete PDF Records'}
          </Button>
          <Button variant="secondary" disabled={exporting} onClick={() => void handleExportData('json')}>
            {exporting ? 'Exporting Archive…' : 'Download JSON Data Archive'}
          </Button>
        </div>

        <div style={{ borderTop: '1px solid #eeece6', paddingTop: 16 }}>
          <h4 style={{ margin: '0 0 6px 0', fontSize: 15 }}>Subscription Cancellation &amp; Offboarding</h4>
          {value.subscription_status === 'cancelled' || value.effective_status === 'cancelled' ? (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', color: '#92400e', fontSize: 13 }}>
              <strong>Cancellation Scheduled:</strong> Your subscription will not renew. Your center remains fully functional through <strong>{dateLabel(value.subscription_ends_at)}</strong>.
            </div>
          ) : (
            <>
              <p className="j-muted" style={{ marginBottom: 12 }}>
                Cancelling will end your renewal cycles. Your access continues uninterrupted until <strong>{dateLabel(value.subscription_ends_at)}</strong>. After this date, your data remains preserved and viewable in read-only mode.
              </p>
              {!cancelModalOpen ? (
                <Button variant="danger" disabled={busy} onClick={() => setCancelModalOpen(true)}>
                  Cancel Subscription &amp; Leave
                </Button>
              ) : (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 18, marginTop: 12 }}>
                  <h4 style={{ color: '#991b1b', margin: '0 0 6px 0' }}>Confirm Subscription Cancellation</h4>
                  <p style={{ fontSize: 13, color: '#7f1d1d', margin: '0 0 12px 0' }}>
                    We recommend downloading your complete records archive above before completing offboarding. Please state your reason for leaving:
                  </p>
                  <label style={{ display: 'block', marginBottom: 12 }}>
                    <textarea
                      placeholder="Please tell us why you are cancelling..."
                      required
                      value={cancelReason}
                      onChange={e => setCancelReason(e.target.value)}
                      style={{ width: '100%', minHeight: 70, padding: 8, borderRadius: 6, border: '1.5px solid #fca5a5', outline: 'none' }}
                    />
                  </label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Button variant="danger" disabled={busy || !cancelReason.trim()} onClick={() => void handleCancelSubscription()}>
                      Confirm Cancellation
                    </Button>
                    <Button variant="ghost" disabled={busy} onClick={() => { setCancelModalOpen(false); setCancelReason(''); }}>
                      Keep Subscription
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Card>
    )}
    {value && <Card><History rows={value.history} /></Card>}
  </div>;
}

export function PackageEditor({ offer, onSaved }: { offer: PackageOffer; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState({ ...offer, reason: '' }), [error, setError] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  useEffect(() => setDraft({ ...offer, reason: '' }), [offer]);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setError(''); setSaved(false); try { const { code, updated_at, features, feature_policy_version, ...body } = draft as any; await operatorApi.savePackage(offer.code, body); await onSaved(); setSaved(true); } catch (err) { setError(apiError(err)); } finally { setBusy(false); } };
  const tierScope = offer.code === 'premium' ? 'Includes core care workflows plus Shop & stock, Business reports & exports, Billing automation, and Front-desk shift scheduling.' : 'Includes core care workflows, authorized pickup verification, health alerts, messaging, manual invoices and receipt review.';
  return <Card title={`${offer.name} package`}><p className="j-muted" style={{ marginTop: 0 }}>{tierScope}</p><form className="j-form" onSubmit={submit}>
    <label>Name<input required value={draft.name} maxLength={80} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
    <label>Description<textarea required minLength={12} maxLength={300} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
    <label>Active-child capacity<input type="number" required min={1} max={1000} value={draft.max_children} onChange={e => setDraft({ ...draft, max_children: Number(e.target.value) })} /></label>
    {(['monthly_price', 'six_month_price', 'annual_price'] as const).map((key, i) => <label key={key}>{['Monthly', 'Six months', 'Annual'][i]} price · ETB<input type="number" min={0.01} step="0.01" value={draft[key] ?? ''} onChange={e => setDraft({ ...draft, [key]: e.target.value || null })} /></label>)}
    <label><span><input type="checkbox" checked={draft.available} onChange={e => setDraft({ ...draft, available: e.target.checked })} /> Accept applications</span></label>
    <label>Reason for change<textarea required minLength={12} maxLength={1000} value={draft.reason} onChange={e => setDraft({ ...draft, reason: e.target.value })} /></label>
    {error && <p role="alert" className="j-error">{error}</p>}{saved && <p role="status">Package saved.</p>}<Button type="submit" disabled={busy}>Save package</Button>
  </form></Card>;
}

function PaymentReview() {
  const [items, setItems] = useState<any[]>([]), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(''), [evidence, setEvidence] = useState(''), [outcome, setOutcome] = useState('refund_recorded');
  const [verifiedReference, setVerifiedReference] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null), [action, setAction] = useState<'review' | 'resolve' | 'recover' | 'apply'>('review');
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [offset, setOffset] = useState(0), [total, setTotal] = useState(0), [loading, setLoading] = useState(true);
  const request = useRef(0);
  const limit = 25;
  const load = async () => {
    const current = ++request.current;
    setLoading(true);
    try {
      const result = await operatorApi.paymentIntents({ search: query, offset, limit });
      if (current === request.current) { setItems(result.items); setTotal(result.total); setError(''); }
    } catch (e) { if (current === request.current) setError(apiError(e)); }
    finally { if (current === request.current) setLoading(false); }
  };
  useEffect(() => { void load(); return () => { request.current++; }; }, [query, offset]);
  const open = (id: string, next: typeof action) => { setSelected(id); setAction(next); setReason(''); setEvidence(''); setVerifiedReference(''); setConfirmed(false); setOutcome('refund_recorded'); };
  const perform = async (item: any, decision?: 'approve' | 'reject') => {
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = { version: item.version, reason: reason.trim() };
      const result = action === 'review' ? await operatorApi.reviewPaymentIntent(item.id, decision === 'approve' ? { ...payload, decision, verified_reference: verifiedReference.trim(), evidence_reference: evidence.trim(), amount_and_receiver_confirmed: confirmed } : { ...payload, decision })
        : action === 'resolve' ? await operatorApi.resolvePaymentIntent(item.id, { ...payload, outcome, evidence_reference: evidence.trim() })
          : action === 'apply' ? await operatorApi.applyPaymentIntent(item.id, { ...payload, acknowledge_restart: confirmed })
            : await operatorApi.recoverPaymentIntent(item.id, payload);
      setNotice(result.message || (action === 'resolve' ? 'Resolution recorded. No refund was sent by Ankelba.' : action === 'apply' ? 'Verified payment applied to the subscription.' : 'Payment review recorded.'));
      setSelected(null); setReason(''); await load();
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };
  return <Card title="Payment review">
    <p>Independently verify the payment and receiving account before approving. Payment review does not approve the daycare application.</p>
    <form className="j-form" onSubmit={e => { e.preventDefault(); setOffset(0); setQuery(search.trim()); }}><label>Search by email, reference, or payment ID<input value={search} maxLength={150} onChange={e => setSearch(e.target.value)} /></label><Button type="submit" disabled={loading}>Search</Button></form>
    <Button variant="secondary" disabled={loading} onClick={() => void load()}>Refresh payments</Button>
    {error && <p role="alert" className="j-error">{error}</p>}{notice && <p role="status">{notice}</p>}{loading ? <p role="status">Loading payments…</p> : !items.length && <p>No payment sessions found.</p>}
    {items.map(item => {
      const canResolve = (item.status === 'verified' && !item.application_id) || (item.status === 'consumed' && item.application_status === 'rejected');
      const canRecover = !['consumed', 'rejected', 'resolved'].includes(item.status) && !item.application_id;
      return <section className="j-panel" key={item.id}>
        <h3>{item.email} · {item.status.replaceAll('_', ' ')}</h3>
        <p>{item.terms?.name || item.terms?.code} · {item.amount} {item.currency} · {item.provider || 'No provider submitted'}</p>
        <p>Reference: {item.payment_reference || 'Not provided'} · Pay to: {item.recipient || 'Not configured'}</p>
        <p>Created {dateLabel(item.created_at)}{item.application_id ? ` · Application #${item.application_id} (${item.application_status || 'status unavailable'})` : ' · No application yet'}</p>
        {item.resolution && <p>Resolution: {String(item.resolution.outcome).replaceAll('_', ' ')} · {item.resolution.evidence_reference} · {item.resolution.reason}</p>}
        {selected !== item.id ? <div className="j-actions">
          {(item.status === 'verification_pending' || (item.status === 'pending' && !['telebirr', 'cbe', 'abyssinia'].includes(item.terms?.recipient_provider))) && <Button variant="secondary" onClick={() => open(item.id, 'review')}>Review payment</Button>}
          {item.status === 'verified' && item.daycare_id && <Button variant="secondary" onClick={() => open(item.id, 'apply')}>Apply verified renewal</Button>}
          {canResolve && <Button variant="secondary" onClick={() => open(item.id, 'resolve')}>Record resolution</Button>}
          {canRecover && <Button variant="secondary" onClick={() => open(item.id, 'recover')}>Email recovery link</Button>}
        </div> : <div className="j-form">
          {action === 'review' && <><p>Independently verify the transaction and its actual amount and receiving account before confirming. If you cannot verify them, leave it pending or reject it.</p><label>Independently verified transaction reference<input minLength={4} maxLength={150} value={verifiedReference} onChange={e => setVerifiedReference(e.target.value)} /></label><label>Evidence or verification reference<input minLength={4} maxLength={200} value={evidence} onChange={e => setEvidence(e.target.value)} /></label><label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> I independently confirmed the exact amount and receiver match this payment.</label></>}
          {action === 'resolve' && <><p>Record an action completed or agreed outside Ankelba. This does not send a refund or issue a credit.</p><label>Resolution outcome<select value={outcome} onChange={e => setOutcome(e.target.value)}><option value="refund_recorded">Refund recorded externally</option><option value="credit_recorded">Credit recorded externally</option><option value="other_resolved">Other resolution recorded</option></select></label><label>Evidence or reference<input required minLength={4} maxLength={200} value={evidence} onChange={e => setEvidence(e.target.value)} /></label></>}
          {action === 'recover' && <p>Independently confirm the applicant’s identity before sending a recovery link to the email address on this payment. The previous session token will stop working.</p>}
          {action === 'apply' && <><p>Apply this already verified renewal after checking the subscription and payment. When the earlier period is too far overdue, this starts a new paid period from now.</p><label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> The daycare has agreed to a new billing start date if needed.</label></>}
          <label>{action === 'recover' ? 'Identity check and reason' : 'Details and reason'}<textarea required minLength={12} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>
          <div className="j-actions">{action === 'review' ? <><Button disabled={busy || reason.trim().length < 12 || verifiedReference.trim().length < 4 || evidence.trim().length < 4 || !confirmed} onClick={() => void perform(item, 'approve')}>Confirm payment</Button><Button variant="danger" disabled={busy || reason.trim().length < 12} onClick={() => void perform(item, 'reject')}>Reject payment</Button></> : <Button disabled={busy || reason.trim().length < 12 || (action === 'resolve' && evidence.trim().length < 4) || (action === 'apply' && !confirmed)} onClick={() => void perform(item)}>{action === 'resolve' ? 'Record external resolution' : action === 'apply' ? 'Apply verified renewal' : 'Send recovery link'}</Button>}<Button variant="ghost" disabled={busy} onClick={() => setSelected(null)}>Cancel</Button></div>
        </div>}
      </section>;
    })}
    {total > 0 && <div className="j-actions"><Button variant="secondary" disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Previous</Button><span>Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}</span><Button variant="secondary" disabled={loading || offset + limit >= total} onClick={() => setOffset(offset + limit)}>Next</Button></div>}
  </Card>;
}

function PaymentSettings() {
  const empty = { enabled: false, account_holder: '', account_number: '' };
  const [settings, setSettings] = useState({ accounts: { telebirr: { ...empty }, cbe: { ...empty }, abyssinia: { ...empty } }, version: 1 });
  const [reason, setReason] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { let active = true; operatorApi.subscriptionPaymentSettings().then(value => { if (active) setSettings({ ...value, accounts: { telebirr: { ...empty }, cbe: { ...empty }, abyssinia: { ...empty }, ...value.accounts } }); }).catch(value => { if (active) setError(apiError(value)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const save = async (event: React.FormEvent) => { event.preventDefault(); if (busy) return; setBusy(true); setError(''); setNotice(''); try { setSettings(await operatorApi.saveSubscriptionPaymentSettings({ accounts: settings.accounts, version: settings.version, reason })); setReason(''); setNotice('Receiving accounts saved for new payment sessions. Existing payment details are unchanged.'); } catch (value) { setError(apiError(value)); } finally { setBusy(false); } };
  return <Card title="Subscription receiving accounts"><p>Configure Telebirr, CBE and Bank of Abyssinia separately. Enable a payment method after confirming its receiving details and account-holder name.</p>
    {error && <p role="alert" className="j-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {loading ? <p>Loading accounts…</p> : <form className="j-form" onSubmit={save}>
      {(['cbe', 'abyssinia', 'telebirr'] as const).map(code => {
        const account = settings.accounts[code]; const name = code === 'telebirr' ? 'Telebirr' : code === 'cbe' ? 'Commercial Bank of Ethiopia' : 'Bank of Abyssinia';
        const change = (patch: Partial<typeof account>) => setSettings(previous => ({ ...previous, accounts: { ...previous.accounts, [code]: { ...previous.accounts[code], ...patch } } }));
        return <section className="j-panel" key={code}><h3>{name}</h3>
          <label><input type="checkbox" disabled={busy} checked={account.enabled} onChange={event => change({ enabled: event.target.checked })} /> Accept subscription payments through {name}</label>
          <label>Account holder name<input required={account.enabled} disabled={busy || !account.enabled} minLength={2} maxLength={150} value={account.account_holder} onChange={event => change({ account_holder: event.target.value })} /></label>
          <label>{code === 'telebirr' ? 'Telebirr phone number' : 'Receiving account number'}<input inputMode="numeric" autoComplete="off" required={account.enabled} disabled={busy || !account.enabled} pattern={code === 'telebirr' ? '(0[79][0-9]{8}|251[79][0-9]{8})' : '[0-9]{6,30}'} maxLength={30} value={account.account_number} onChange={event => change({ account_number: event.target.value })} /></label>
        </section>;
      })}
      <label>Reason for change<textarea required minLength={12} maxLength={1000} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <Button type="submit" disabled={busy}>Save receiving accounts</Button>
    </form>}
  </Card>;
}

function ManageSubscription({ value, offers, onSaved, onRefreshOffers }: { value: any; offers: PackageOffer[]; onSaved: () => Promise<void>; onRefreshOffers: () => Promise<void> }) {
  const [action, setAction] = useState<'cancel' | 'resume' | 'change_package' | 'authorize_restart'>(value.subscription_status === 'cancelled' ? 'resume' : 'cancel');
  const [code, setCode] = useState<'standard' | 'premium'>(value.subscription_terms?.code || 'standard');
  const [cycle, setCycle] = useState<Cycle>(value.billing_cycle || 'monthly');
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [restartAgreed, setRestartAgreed] = useState(false);
  const requestKey = useRef('');
  useEffect(() => {
    requestKey.current = `subscription_${globalThis.crypto?.randomUUID?.().replaceAll('-', '') || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
  }, [value.id, value.version, action, code, cycle, reason]);
  useEffect(() => { setAction(value.subscription_status === 'cancelled' ? 'resume' : 'cancel'); }, [value.id, value.subscription_status]);
  useEffect(() => { if (!offers.some(offer => offer.available && offer.code === code)) { const first = offers.find(offer => offer.available); if (first) setCode(first.code); } }, [offers, code]);
  const selectedOffer = offers.find(offer => offer.code === code && offer.available);
  const selectedPrice = selectedOffer && offerPrice(selectedOffer, cycle);
  const paidThrough = value.subscription_ends_at && new Date(value.subscription_ends_at).getTime() > Date.now();
  const canChange = !value.scheduled_change && (!paidThrough || value.subscription_status === 'active') && selectedPrice != null && Number(selectedPrice) > 0;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !requestKey.current || (action === 'change_package' && !canChange) || (action === 'authorize_restart' && !restartAgreed)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const body: any = { action, version: value.version, request_key: requestKey.current, reason: reason.trim() };
      if (action === 'change_package') Object.assign(body, { package_code: code, billing_cycle: cycle, terms_version: selectedOffer?.version });
      if (action === 'authorize_restart') {
        await operatorApi.authorizeRenewalRestart(value.id, { version: value.version, reason: reason.trim(), acknowledge_restart: true });
      } else {
        await operatorApi.subscriptionAction(value.id, body);
      }
      await onSaved();
      setReason(''); setRestartAgreed(false);
      if (action === 'authorize_restart') setAction('cancel');
      setNotice(action === 'authorize_restart' ? 'Payment restart authorized. The daycare remains read-only until payment is verified.' : 'Subscription action recorded.');
    } catch (e: any) {
      setError(apiError(e));
      if (e?.response?.status === 409) {
        try { await onRefreshOffers(); await onSaved(); } catch { /* The current error remains visible; the operator can retry after refreshing. */ }
      }
    } finally { setBusy(false); }
  };
  return <form className="j-form" onSubmit={submit}>
    <h3>Manage subscription</h3>
    <label>Action<select value={action} disabled={busy} onChange={e => { setRestartAgreed(false); setAction(e.target.value as typeof action); }}>
      {value.subscription_status === 'cancelled' ? <option value="resume">Resume renewal</option> : <option value="cancel">Cancel future renewal</option>}
      <option value="change_package">Agree different package terms</option>
      {value.renewal_restart_eligible && <option value="authorize_restart">Authorize overdue payment restart</option>}
    </select></label>
    {action === 'cancel' && <p>Future renewal will be cancelled. The current paid period remains available through {dateLabel(value.subscription_ends_at)}.</p>}
    {action === 'resume' && <p>Resume renewal using the previously agreed terms. The daycare still needs a verified payment for the next period.</p>}
    {value.renewal_restart_authorization?.expires_at && new Date(value.renewal_restart_authorization.expires_at).getTime() > Date.now() &&
      <p role="status">An overdue payment restart is authorized until {dateLabel(value.renewal_restart_authorization.expires_at)}. Access resumes only after the payment is verified.</p>}
    {action === 'authorize_restart' && <>
      <p>Only authorize this after agreeing the restart with the daycare. The daycare may then pay using its existing package terms; no access is restored yet. A new billing period starts when that payment is verified.</p>
      <label><input type="checkbox" checked={restartAgreed} disabled={busy} onChange={e => setRestartAgreed(e.target.checked)} /> The daycare has agreed to restart its paid period on payment verification.</label>
    </>}
    {action === 'change_package' && <>
      <p>Agree the new package and billing period with the daycare first. Capacity must accommodate active enrollment when the change takes effect.</p>
      {paidThrough && <p role="status">Current features and capacity stay in effect through {dateLabel(value.subscription_ends_at)}. The agreed package is scheduled for the next period and requires verified payment.</p>}
      {value.scheduled_change && <p role="status">A future package change is already open. Resolve it before agreeing another change.</p>}
      <label>Package<select value={code} disabled={busy} onChange={e => setCode(e.target.value as typeof code)}>{offers.filter(offer => offer.available).map(offer => <option key={offer.code} value={offer.code}>{offer.name} · {offer.max_children} children</option>)}</select></label>
      <label>Billing period<select value={cycle} disabled={busy} onChange={e => setCycle(e.target.value as Cycle)}><option value="monthly">Monthly</option><option value="six_month">Six months</option><option value="annual">Annual</option></select></label>
      <p>{priceLabel(selectedPrice, cycle)}</p>
      {!selectedOffer || selectedPrice == null || Number(selectedPrice) <= 0 ? <p>Configure a positive price for this package and billing period first.</p> : null}
    </>}
    <label>Reason and agreement<textarea required minLength={12} maxLength={1000} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} /></label>
    {error && <p role="alert" className="j-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <Button type="submit" disabled={busy || reason.trim().length < 12 || (action === 'change_package' && !canChange) || (action === 'resume' && !value.subscription_ends_at) || (action === 'authorize_restart' && !restartAgreed)}>{action === 'authorize_restart' ? 'Authorize payment restart' : 'Record subscription action'}</Button>
  </form>;
}

export function OperatorSubscriptions({ daycares, initialId, onChanged }: { daycares: any[]; initialId?: number; onChanged: () => Promise<void> }) {
  const [tab, setTab] = useState<'payments' | 'packages' | 'subscriptions' | 'settings'>('payments'), [offers, setOffers] = useState<PackageOffer[]>([]), [id, setId] = useState(initialId || 0), [value, setValue] = useState<any>(null), [error, setError] = useState('');
  const selectedId = useRef(id); selectedId.current = id;
  const loadOffers = async () => { setOffers(await operatorApi.packages()); };
  useEffect(() => { void loadOffers().catch(e => setError(apiError(e))); }, []);
  useEffect(() => { let live = true; setValue(null); if (id) operatorApi.subscription(id).then(result => { if (live) setValue(result); }).catch(e => { if (live) setError(apiError(e)); }); return () => { live = false; }; }, [id]);
  const refreshSubscription = async (requestedId: number) => { const current = await operatorApi.subscription(requestedId); if (selectedId.current === requestedId) setValue(current); await onChanged(); };
  return <div className="journey"><div className="j-actions"><Button variant={tab === 'payments' ? 'primary' : 'secondary'} onClick={() => setTab('payments')}>Payment review</Button><Button variant={tab === 'packages' ? 'primary' : 'secondary'} onClick={() => setTab('packages')}>Package catalog</Button><Button variant={tab === 'subscriptions' ? 'primary' : 'secondary'} onClick={() => setTab('subscriptions')}>Subscriptions</Button><Button variant={tab === 'settings' ? 'primary' : 'secondary'} onClick={() => setTab('settings')}>Receiving accounts</Button></div>{error && <p role="alert" className="j-error">{error}</p>}
    {tab === 'payments' ? <PaymentReview /> : tab === 'packages' ? <div className="j-grid">{offers.map(offer => <PackageEditor key={offer.code} offer={offer} onSaved={loadOffers} />)}</div> : tab === 'settings' ? <PaymentSettings /> : <Card title="Daycare subscriptions"><label>Choose a daycare<select value={id} onChange={e => setId(Number(e.target.value))}><option value={0}>Select daycare</option>{daycares.filter(d => ['active', 'suspended'].includes(d.status)).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>{value && <><Summary value={value} /><ManageSubscription key={value.id} value={value} offers={offers} onSaved={() => refreshSubscription(value.id)} onRefreshOffers={loadOffers} /><History rows={value.history} /></>}</Card>}
  </div>;
}
