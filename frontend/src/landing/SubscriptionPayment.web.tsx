import React, { useEffect, useRef, useState } from 'react';
import { apiError, portalApi } from '../portal/api';
import ReceiptReference from '../portal/ReceiptReference.web';
import { Cycle, PackageOffer, priceLabel } from '../portal/subscriptions';
import LottieVerified from './LottieVerified.web';

export type PaymentSession = {
  id: string;
  token: string;
  status: string;
  terms: any;
  email?: string;
  recipient?: any;
  recipient_name?: string;
  recipient_institution?: string;
  expires_at?: string;
  provider?: string;
  payment_reference?: string;
  server_time?: string;
  message?: string;
};

const storageKey = 'ankelba_application_payment';

export function clearApplicationPayment() {
  try {
    window.sessionStorage.removeItem(storageKey);
    window.sessionStorage.removeItem('ankelba_payment_resume');
  } catch {}
}

export default function SubscriptionPayment({ onPaid, resume, selection, onSession, onBusyChange }: {
  onPaid: (value: PaymentSession) => void;
  resume?: { id: string; token: string } | null;
  selection?: { offer: PackageOffer; cycle: Cycle };
  onSession?: (value: PaymentSession | null) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [email, setEmail] = useState('');
  const [session, setSession] = useState<PaymentSession | null>(null);
  const [reference, setReference] = useState('');
  const [suffix, setSuffix] = useState('');
  const [bank, setBank] = useState('cbe');
  const [accounts, setAccounts] = useState<{provider:string;institution:string;account_holder:string;account_number:string}[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState('');
  const [accountsAttempt, setAccountsAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [restartAcknowledged, setRestartAcknowledged] = useState(false);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [restoreMissing, setRestoreMissing] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<'amount' | 'account' | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const requestInFlight = useRef(false);
  const errorNotice = useRef<HTMLParagraphElement>(null);
  const recoverySession = useRef<{ id: string; token: string } | null>(null);
  useEffect(() => {
    let active = true;
    setAccountsLoading(true);
    setAccountsError('');
    portalApi.publicPaymentSettings().then((value: any) => {
      if (!active) return;
      const all = Array.isArray(value?.accounts) ? value.accounts.filter((item: any) => ['telebirr', 'cbe', 'abyssinia'].includes(item.provider)) : [];
      setAccounts(all);
      setBank(prev => all.some((item: any) => item.provider === prev) ? prev : all[0]?.provider || 'cbe');
    }).catch(reason => {
      if (active) setAccountsError(apiError(reason));
    }).finally(() => {
      if (active) setAccountsLoading(false);
    });
    return () => { active = false; };
  }, [accountsAttempt]);


  useEffect(() => {
    if (!error) return;
    errorNotice.current?.focus({ preventScroll: true });
    errorNotice.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);

  useEffect(() => {
    let recovery = resume;
    setRestoreMissing(false);
    try {
      if (!recovery) {
        const savedRecovery = window.sessionStorage.getItem('ankelba_payment_resume');
        if (savedRecovery) recovery = JSON.parse(savedRecovery);
      }
      const saved = window.sessionStorage.getItem(storageKey);
      if (saved && !recovery) {
        const parsed = JSON.parse(saved);
        setSession(parsed);
        if (parsed?.id && parsed?.token && (!parsed.status || parsed.status === 'pending')) {
          portalApi.paymentIntentStatus(parsed.id, parsed.token).then(value => {
            const fresh = { ...parsed, ...value, token: parsed.token };
            setSession(fresh);
            try { window.sessionStorage.setItem(storageKey, JSON.stringify(fresh)); } catch {}
          }).catch(reason => { if(reason?.response?.status===404)setRestoreMissing(true); });
        }
      }
    } catch {
      clearApplicationPayment();
    }
    if (recovery) {
      const { id, token } = recovery;
      recoverySession.current = recovery;
      setBusy(true);
      setError('');
      portalApi.paymentIntentStatus(id, token).then(value => {
        const restored = { ...value, token };
        setSession(restored);
        try {
          window.sessionStorage.setItem(storageKey, JSON.stringify(restored));
          window.sessionStorage.removeItem('ankelba_payment_resume');
        } catch {}
      }).catch(e => {setError(apiError(e));if(e?.response?.status===404)setRestoreMissing(true);}).finally(() => setBusy(false));
    }
  }, [resume, restoreAttempt]);

  useEffect(() => {
    if (session) onSession?.(session);
  }, [session, onSession]);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    if (!session || !session.expires_at || session.status === 'verified' || session.status === 'consumed') {
      setTimeLeft(null);
      return;
    }
    const computeSeconds = () => {
      const expiresMs = new Date(session.expires_at!).getTime();
      const nowMs = Date.now();
      return Math.max(0, Math.floor((expiresMs - nowMs) / 1000));
    };
    setTimeLeft(computeSeconds());
    if (typeof setInterval !== 'undefined') {
      const interval = setInterval(() => {
        const remaining = computeSeconds();
        setTimeLeft(remaining);
        if (remaining <= 0 && typeof clearInterval !== 'undefined') clearInterval(interval);
      }, 1000);
      if (typeof interval === 'object' && typeof (interval as any)?.unref === 'function') {
        (interval as any).unref();
      }
      return () => { if (typeof clearInterval !== 'undefined') clearInterval(interval); };
    }
  }, [session?.expires_at, session?.status]);

  useEffect(() => {
    if (session?.status === 'verified' || session?.status === 'approved') {
      setShowCelebration(true);
    }
  }, [session?.status]);

  const save = (value: PaymentSession) => {
    setSession(value);
    try { window.sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch {}
  };

  const copyToClipboard = (text: string, field: 'amount' | 'account') => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
      }
    } catch {}
  };

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selection || busy || requestInFlight.current || accountsLoading || accountsError || !accounts.some(item => item.provider === bank)) return;
    requestInFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const chosenProvider = bank;
      save({ ...await portalApi.createPaymentIntent({ package_code: selection.offer.code, billing_cycle: selection.cycle, email, provider: chosenProvider }), email });
    } catch (e) {
      setError(apiError(e));
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  };

  const refresh = async (verify: boolean) => {
    if (!session || busy || requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const prov = session.terms?.recipient_provider;
      const result = verify
        ? await portalApi.verifyPaymentIntent(session.id, { token: session.token, provider: prov, reference, ...(prov === 'abyssinia' && suffix ? { suffix } : {}) })
        : await portalApi.paymentIntentStatus(session.id, session.token);
      const updated = { ...session, ...result, token: session.token };
      save(updated);
      setNotice(result.message || (updated.status === 'verified' ? 'Payment verified.' : 'Payment is pending review. If you already paid, do not pay again.'));
      if (updated.status === 'verified') {
        setShowCelebration(true);
      }
    } catch (e) {
      setError(apiError(e));if((e as any)?.response?.status===404)setRestoreMissing(true);
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  };

  const restart = async () => {
    if (!session || !restartAcknowledged || busy || requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const current = { ...session, ...await portalApi.paymentIntentStatus(session.id, session.token), token: session.token };
      const currentExpired = !!current.expires_at && new Date(current.expires_at).getTime() <= Date.now();
      if (['verified', 'consumed', 'approved'].includes(current.status)) {
        save(current);
        setError('This payment has already been confirmed. Keep this session and contact support if you need help.');
        return;
      }
      if (!['rejected', 'resolved'].includes(current.status) && !currentExpired) {
        save(current);
        setError('This payment session is still active. You can correct the reference or refresh its status.');
        return;
      }
      clearApplicationPayment();
      recoverySession.current = null;
      setSession(null);
      setReference('');
      setRestartAcknowledged(false);
      setShowCelebration(false);
      onSession?.(null);
    } catch (e) {
      setError(apiError(e));if((e as any)?.response?.status===404)setRestoreMissing(true);
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  };

  const verified = session?.status === 'verified' || session?.status === 'approved';
  const expired = !!session?.expires_at && new Date(session.expires_at).getTime() <= Date.now();
  const mayRestart = !!session && !verified && session.status !== 'consumed' && (expired || ['rejected', 'resolved'].includes(session.status));
  const recipient = session?.recipient;
  const recipientAccount = typeof recipient === 'string' ? recipient : recipient?.account || recipient?.account_number || '';
  const recipientName = session?.recipient_name || session?.terms?.recipient_name || '';
  const boundBank = session?.terms?.recipient_provider;
  const isTelebirr = boundBank === 'telebirr';
  const supportedBank = ['cbe', 'abyssinia', 'telebirr'].includes(boundBank);
  const bankLabel = session?.recipient_institution || session?.terms?.recipient_institution || (isTelebirr ? 'Telebirr' : 'Receiving bank');
  const formattedPrice = priceLabel(session?.terms?.price, session?.terms?.billing_cycle || selection?.cycle || 'monthly');

  const timerMinutes = Math.floor((timeLeft ?? 0) / 60);
  const timerSeconds = (timeLeft ?? 0) % 60;
  const timerFormatted = `${String(timerMinutes).padStart(2, '0')}:${String(timerSeconds).padStart(2, '0')}`;
  const isExpiringSoon = timeLeft !== null && timeLeft <= 120;

  if(restoreMissing)return <div className="journey">
    <div className="j-panel" role="alert"><h2>Payment session unavailable</h2>
      <p>This saved payment session could not be found. If you already paid, contact the platform team before making another payment.</p>
      <button type="button" className="saas-btn saas-btn-primary" disabled={busy} onClick={()=>{
        clearApplicationPayment();recoverySession.current=null;setSession(null);setRestoreMissing(false);setError('');onSession?.(null);
      }}>Return to pricing</button>
    </div>
  </div>;

  return (
    <div className="journey">
      {/* Celebration Modal on Successful Verification */}
      {showCelebration && verified && (
        <div className="payment-celebration-backdrop" role="dialog" aria-modal="true">
          <div className="payment-celebration-dialog">
            <div className="celebration-icon-wrapper">
              <div className="celebration-pulse-ring" />
              <LottieVerified size={100} />
            </div>
            <h2>Payment Received!</h2>
            <p className="celebration-amount">{formattedPrice}</p>
            <p className="celebration-text">
              Your payment has been confirmed. You can now complete your daycare application.
            </p>
            {session?.payment_reference && (
              <div className="celebration-ref-badge">
                <span>Reference:</span> <code>{session.payment_reference}</code>
              </div>
            )}
            <button
              type="button"
              className="saas-btn saas-btn-primary celebration-cta"
              onClick={() => onPaid(session!)}
              autoFocus
            >
              Continue to Application →
            </button>
          </div>
        </div>
      )}

      {!session ? (
        <>
          {!selection ? (
            <div role="status">
              <p>
                {busy
                  ? 'Restoring your payment session…'
                  : recoverySession.current
                  ? 'Your payment details could not be restored. Retry before continuing.'
                  : 'Choose a package and billing period to start your payment.'}
              </p>
              {!busy && recoverySession.current && (
                <button
                  type="button"
                  className="saas-btn saas-btn-primary"
                  onClick={() => setRestoreAttempt(value => value + 1)}
                >
                  Retry payment recovery
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="pricing-checkout-heading">
                <h2>{accounts.length > 1 ? 'Choose a payment method and confirm email' : 'Confirm your email to begin payment'}</h2>
                <p>
                  {selection.offer.name} · {priceLabel(selection.offer[selection.cycle === 'annual' ? 'annual_price' : selection.cycle === 'six_month' ? 'six_month_price' : 'monthly_price'], selection.cycle)}.
                </p>
              </div>
              <form className="j-form" onSubmit={start}>
                {accounts.length > 0 && (
                  <label>Payment method<select required value={bank} disabled={busy || accountsLoading} onChange={event => setBank(event.target.value)}>
                    {accounts.map(item => <option key={item.provider} value={item.provider}>{item.institution}</option>)}
                  </select></label>
                )}
                {accountsLoading ? <p role="status">Loading payment options…</p> : accountsError ? <div role="alert"><p>{accountsError}</p><button type="button" className="saas-btn saas-btn-ghost" onClick={() => setAccountsAttempt(value => value + 1)}>Retry payment options</button></div> : !accounts.length ? <p role="status">Receiving accounts are not configured yet. Contact the platform team before paying.</p> : null}
                <label>
                  Director’s email
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </label>
                <p className="j-muted">
                  Use this same email for your director account. Your subscription begins after your application is approved.
                </p>
                <button className="saas-btn saas-btn-primary" disabled={busy || accountsLoading || !!accountsError || !accounts.some(item => item.provider === bank)}>
                  {busy ? 'Preparing payment…' : 'Continue to payment'}
                </button>
              </form>
            </>
          )}
        </>
      ) : (
        <>
          {/* Minimalist Invoice Card */}
          <div className="payment-invoice-card">
            <div className="payment-invoice-header">
              <div className="payment-invoice-title">
                <h3>Payment for {session.terms?.name || session.terms?.code || 'your package'}</h3>
                <p className="j-muted" style={{ margin: '4px 0 0' }}>
                  {session.terms?.billing_cycle || selection?.cycle || 'monthly'} · up to {session.terms?.max_children ?? '—'} children
                </p>
              </div>
              {timeLeft !== null && !verified && (
                <div
                  className={`payment-countdown ${isExpiringSoon ? 'countdown-warning' : ''}`}
                  role="timer"
                  aria-live="polite"
                  title="Session remaining time"
                >
                  <span>⏳</span>
                  <span>{timerFormatted}</span>
                </div>
              )}
            </div>

            <div className="payment-invoice-body">
              {/* Amount Row */}
              <div className="payment-invoice-row">
                <div className="invoice-meta">
                  <span className="invoice-label">Amount to Pay</span>
                  <strong className="invoice-value invoice-amount">{formattedPrice}</strong>
                </div>
                <button
                  type="button"
                  className="payment-copy-btn"
                  onClick={() => copyToClipboard(String(session.terms?.price || ''), 'amount')}
                  title="Copy exact amount"
                >
                  {copiedField === 'amount' ? '✓ Copied' : 'Copy'}
                </button>
              </div>

              {/* Bank or Telebirr account row */}
              {recipientAccount && (
                <div className="payment-invoice-row">
                  <div className="invoice-meta">
                    <span className="invoice-label">{isTelebirr ? 'Telebirr phone number' : 'Receiving account number'}</span>
                    <strong className="invoice-value invoice-phone">{recipientAccount}</strong>
                  </div>
                  <button
                    type="button"
                    className="payment-copy-btn"
                    onClick={() => copyToClipboard(recipientAccount, 'account')}
                    title="Copy account number"
                  >
                    {copiedField === 'account' ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              )}

              {/* Account Name Row */}
              <div className="payment-invoice-row">
                <div className="invoice-meta">
                  <span className="invoice-label">{bankLabel} · Account holder</span>
                  <span className="invoice-value invoice-name">
                    {recipientName}
                    <span className="verified-pill">{isTelebirr ? 'Telebirr' : 'Bank account'}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <p role="status">
            Payment status: <strong>{session.status?.replaceAll('_', ' ') || 'pending'}</strong>
          </p>

          {/* Soft Expiry Notice if timer reached zero */}
          {expired && !verified && session.status !== 'consumed' && (
            <div className="payment-soft-expiry" role="status">
              <p><strong>This payment session has expired.</strong></p>
              <p className="j-muted">
                If you already paid, contact the platform team with your reference. Do not pay again. If you have not paid, you can start a new session.
              </p>
            </div>
          )}

          {verified ? (
            <button
              type="button"
              className="saas-btn saas-btn-primary"
              onClick={() => onPaid(session)}
            >
              Continue to application
            </button>
          ) : mayRestart ? (
            <div className="j-panel">
              <p>
                This payment session is no longer available for verification. If you already paid, do not pay again; contact the platform team with your reference.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={restartAcknowledged}
                  onChange={e => setRestartAcknowledged(e.target.checked)}
                />{' '}
                I understand that starting again does not refund or transfer a previous payment.
              </label>
              <button
                type="button"
                className="saas-btn saas-btn-ghost"
                disabled={busy || !restartAcknowledged}
                onClick={() => void restart()}
              >
                Start a new payment session
              </button>
            </div>
          ) : !supportedBank ? (
            <div className="j-panel" role="status"><p>This session uses a previous payment method. Contact the platform team to review it. If you already paid, do not pay again.</p><button type="button" className="saas-btn saas-btn-ghost" disabled={busy} onClick={()=>void refresh(false)}>Refresh payment status</button></div>
          ) : session.status === 'consumed' ? (
            <p>This payment has already been used. Check your application status or contact support.</p>
          ) : (
            <>
              <form className="j-form" aria-busy={busy} onSubmit={e => { e.preventDefault(); void refresh(true); }}>
                {boundBank !== 'cbe' && <ReceiptReference id={session.id} token={session.token} onReference={setReference} />}
                <label>
                  {boundBank==='cbe'?'CBE receipt link':isTelebirr ? 'Telebirr transaction reference' : 'Transaction reference'}
                  <input
                    required
                    type={boundBank==='cbe'?'url':'text'}
                    pattern={boundBank==='cbe'?'https://(mbreciept\\.cbe\\.com\\.et|apps\\.cbe\\.com\\.et(:100)?)/.+':undefined}
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    autoComplete="off"
                    placeholder={isTelebirr ? 'Enter Telebirr reference' : boundBank==='cbe'?'https://mbreciept.cbe.com.et/…':'Bank of Abyssinia reference'}
                    maxLength={boundBank==='cbe'?2048:150}
                  />
                </label>
                {boundBank==='cbe'&&<p className="j-muted">Copy the full receipt link from CBE and paste it here. No account suffix is needed.</p>}
                {boundBank==='abyssinia' && (
                  <>
                    <label>Account suffix (5 digits)
                      <input inputMode="numeric" autoComplete="off" value={suffix} required pattern="[0-9]{5}" maxLength={5} onChange={event=>setSuffix(event.target.value)}/>
                    </label>
                    <p className="j-muted">Use the suffix required by your receipt’s verification details. Do not assume it is the receiving account’s suffix.</p>
                  </>
                )}
                {(busy || notice || session.message) && <p role="status" aria-live="polite">{busy ? 'Checking the reference and matching the payment details…' : notice || session.message}</p>}
                <button className="saas-btn saas-btn-primary" disabled={busy}>
                  {busy ? 'Checking payment…' : 'Verify payment'}
                </button>
              </form>
              <div className="payment-secondary-actions">
                <button
                  type="button"
                  className="saas-btn saas-btn-ghost"
                  disabled={busy}
                  onClick={() => void refresh(false)}
                >
                  Refresh payment status
                </button>
              </div>
              <p className="j-muted">Keep this payment session until verification finishes. If you already paid, do not start another payment.</p>
            </>
          )}
        </>
      )}
      {error && <p ref={errorNotice} tabIndex={-1} role="alert" className="j-error">{error}</p>}
    </div>
  );
}
