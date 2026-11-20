import { useCallback, useEffect, useState } from 'react';
import type { AxiosInstance } from 'axios';
export const emailError = (error: any) => error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Unable to complete the request. Try again.';
export function useEmailAccount(client: AxiosInstance) {
  const [account, setAccount] = useState<{ email: string; verified: boolean; email_updates: boolean } | null>(null);
  const [requestId, setRequestId] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(c => c - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  const load = useCallback(async () => { const { data } = await client.get('/email/status'); setAccount(data); }, [client]);
  useEffect(() => { load().catch(e => setError(emailError(e))); }, [load]);
  const action = async (fn: () => Promise<void>) => { setBusy(true); setError(''); setMessage(''); try { await fn(); } catch (e) { setError(emailError(e)); } finally { setBusy(false); } };
  const send = () => action(async () => {
    const { data } = await client.post('/email/request-code', { email: account?.email, purpose: 'verify' });
    setRequestId(data.request_id); setCode(''); setCooldown(data.resend_after); setMessage(data.message);
  });
  const verify = () => action(async () => {
    await client.post('/email/confirm-code', { request_id: requestId, code });
    await load(); setRequestId(''); setCode(''); setMessage('Email verified.');
  });
  const toggle = () => action(async () => {
    await client.patch('/notifications/preferences', { notifications: { email: !account?.email_updates } });
    await load(); setMessage('Email preferences saved.');
  });
  return { account, requestId, code, setCode, busy, message, error, cooldown, send, verify, toggle, reload: () => action(load) };
}
