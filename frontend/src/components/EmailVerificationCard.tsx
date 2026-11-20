import React from 'react';
import { Card, Text, Field, Button, Notice } from './design/System';
import { apiClient } from '../api/client';
import { useEmailAccount } from '../hooks/useEmailAccount';
export function EmailVerificationCard() {
  const email = useEmailAccount(apiClient);
  return <Card>
    <Text size={20} weight="bold">Email notifications</Text>
    {email.account && <>
      <Text style={{ marginVertical: 12 }}>{email.account.email} · {email.account.verified ? 'Verified' : 'Not verified'}</Text>
      {!email.account.verified && <>
        <Button title={email.cooldown ? `Resend in ${email.cooldown}s` : email.requestId ? 'Resend code' : 'Verify email'} disabled={email.busy || !!email.cooldown} onPress={email.send} />
        {email.requestId && <>
          <Field label="6-digit email code" value={email.code} onChangeText={email.setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" />
          <Button title="Confirm code" disabled={email.busy || !/^\d{6}$/.test(email.code)} onPress={email.verify} />
        </>}
      </>}
      <Button title={email.account.email_updates ? 'Turn off daycare emails' : 'Turn on daycare emails'} variant="secondary" disabled={email.busy} onPress={email.toggle} style={{ marginTop: 12 }} />
    </>}
    {email.error ? <><Notice tone="error">{email.error}</Notice>{!email.account && <Button title="Retry" onPress={email.reload} disabled={email.busy} />}</> : null}
    {email.message ? <Notice>{email.message}</Notice> : null}
  </Card>;
}
