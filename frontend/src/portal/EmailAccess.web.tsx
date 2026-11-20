import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getApiBaseUrl } from '../utils/host';
import { Button, Card, PasswordInput } from './ui.web';
import { emailError, useEmailAccount } from '../hooks/useEmailAccount';
import { portalClient } from './api';
import './portal.css';
// Public recovery never reads a parent, staff or operator session token.
const publicClient = axios.create({ baseURL: getApiBaseUrl(), timeout: 15000, withCredentials: false });
export default function EmailAccess({ purpose }: { purpose: 'reset' | 'verify' }) {
  const [email, setEmail] = useState('');
  const [requestId, setRequestId] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(c => c - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  const perform = async (action: () => Promise<void>) => { setBusy(true); setError(''); setMessage(''); try { await action(); } catch (e) { setError(emailError(e)); } finally { setBusy(false); } };
  const send = () => perform(async () => {
    const { data } = await publicClient.post('/email/request-code', { email: email.trim(), purpose });
    setRequestId(data.request_id); setCode(''); setCooldown(data.resend_after); setMessage(data.message);
  });
  const verify = () => perform(async () => {
    if (purpose === 'reset' && password !== confirm) throw Error('Passwords must match.');
    const { data } = await publicClient.post('/email/confirm-code', { request_id: requestId, code, ...(purpose === 'reset' ? { new_password: password } : {}) });
    setPassword(''); setConfirm(''); setCode(''); setDone(true); setMessage(data.message);
  });
  return <main className="ankelba-portal email-access">
    <Card title={purpose === 'reset' ? 'Reset password' : 'Verify email'}>
      {!done && <form onSubmit={event => { event.preventDefault(); void (requestId ? verify() : send()); }}>
        <label>Email address<input type="email" autoComplete="email" required value={email} readOnly={!!requestId} onChange={e => setEmail(e.target.value)} /></label>
        {requestId && <>
          <label>6-digit email code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} /></label>
          <p>Code expires in 10 minutes.</p>
          {purpose === 'reset' && <>
            <label>New password<PasswordInput autoComplete="new-password" minLength={12} maxLength={72} required value={password} onChange={e => setPassword(e.target.value)} /></label>
            <label>Confirm password<PasswordInput autoComplete="new-password" minLength={12} maxLength={72} required value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
          </>}
        </>}
        <Button type="submit" disabled={busy || (!requestId && !!cooldown)}>{busy ? 'Please wait…' : !requestId ? cooldown ? `Send in ${cooldown}s` : 'Send code' : purpose === 'reset' ? 'Reset password' : 'Confirm code'}</Button>
        {requestId && <div className="email-actions">
          <Button disabled={busy || !!cooldown} variant="secondary" onClick={send}>{cooldown ? `Resend in ${cooldown}s` : 'Resend code'}</Button>
          <Button disabled={busy} variant="secondary" onClick={() => { setRequestId(''); setCode(''); setMessage(''); }}>Change email</Button>
        </div>}
      </form>}
      {error && <div className="p-error" role="alert">{error}</div>}
      {message && <p role="status">{message}</p>}
      <footer className="email-actions"><a href="/admin/login">Staff sign in</a><a href="/app">Parent app</a><a href="/platform/login">Super admin</a></footer>
    </Card>
  </main>;
}
export function EmailSettings() {
  const email = useEmailAccount(portalClient);
  return <Card title="Email notifications">
    {email.account && <>
      <p>{email.account.email} · {email.account.verified ? 'Verified' : 'Not verified'}</p>
      {!email.account.verified && <>
        <Button disabled={email.busy || !!email.cooldown} onClick={email.send}>{email.cooldown ? `Resend in ${email.cooldown}s` : email.requestId ? 'Resend code' : 'Verify email'}</Button>
        {email.requestId && <form className="email-verification-form" onSubmit={e => { e.preventDefault(); void email.verify(); }}>
          <label>6-digit email code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={email.code} onChange={e => email.setCode(e.target.value)} /></label>
          <Button type="submit" disabled={email.busy}>Confirm code</Button>
        </form>}
      </>}
      <div className="email-actions"><Button variant="secondary" disabled={email.busy} onClick={email.toggle}>{email.account.email_updates ? 'Turn off daycare emails' : 'Turn on daycare emails'}</Button></div>
    </>}
    {email.error && <><div className="p-error" role="alert">{email.error}</div>{!email.account && <Button disabled={email.busy} onClick={email.reload}>Retry</Button>}</>}
    {email.message && <p role="status">{email.message}</p>}
  </Card>;
}
