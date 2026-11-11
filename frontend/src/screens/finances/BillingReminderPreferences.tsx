import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Switch, View } from 'react-native';
import { Button, Card, Notice, Text } from '../../components/design/System';
import { apiClient } from '../../api/client';
import { colors } from '../../theme/tokens';

const preferenceUrl = '/billing-automation/my-reminders/preferences';

export default function BillingReminderPreferences() {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const busy = useRef(false);
  const mounted = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get(preferenceUrl);
      if (!mounted.current) return;
      const value = data.billing_email === true;
      setSaved(value);
      setEnabled(value);
    } catch {
      if (mounted.current) setError('Could not load your billing email preference. Please retry.');
    } finally {
      busy.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  const save = async () => {
    if (busy.current || saved === null || enabled === saved) return;
    busy.current = true;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { data } = await apiClient.patch(preferenceUrl, { email_enabled: enabled });
      if (!mounted.current) return;
      const value = data.billing_email === true;
      setSaved(value);
      setEnabled(value);
      setSuccess(value ? 'Billing email reminders are allowed.' : 'Billing email reminders are turned off.');
    } catch {
      if (mounted.current) setError('Could not save your preference. Please try again.');
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  return (
    <Card style={{ marginBottom: 18, gap: 12 }}>
      <Text size={18} weight="bold">Billing reminders</Text>
      <Text color={colors.textSecondary}>
        Receive reminders about unpaid fees when your daycare offers email reminders.
      </Text>
      {loading ? <Text>Loading your preference…</Text> : saved === null ? (
        <><Notice tone="error">{error}</Notice><Button title="Retry preference" onPress={() => void load()} /></>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 }}>
            <Text weight="semibold" style={{ flex: 1 }}>Email care fee reminders</Text>
            <Switch
              accessibilityLabel="Email care fee reminders"
              style={{ minHeight: 44, minWidth: 44 }}
              disabled={saving}
              value={enabled}
              onValueChange={value => { setEnabled(value); setError(''); setSuccess(''); }}
              trackColor={{ false: colors.borderCard, true: colors.bgNavy }}
            />
          </View>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {success ? <Text accessibilityLiveRegion="polite" color={colors.textSecondary}>{success}</Text> : null}
          <Button title="Save reminder preference" onPress={() => void save()} loading={saving} disabled={saving || enabled === saved} />
        </>
      )}
    </Card>
  );
}
