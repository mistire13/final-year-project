import React, { useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { ShieldCheck } from "phosphor-react-native/src/icons/ShieldCheck";
import { Clock } from "phosphor-react-native/src/icons/Clock";
import { ChatCircle } from "phosphor-react-native/src/icons/ChatCircle";
import {
  Page,
  Text,
  Card,
  Badge,
  Notice,
  Button,
} from "../../components/design/System";
import { useChild } from "../../context/ChildContext";
import {
  getChildAttendance,
  getChildGuardians,
  AttendanceRecord,
  GuardianRecord,
  guardianRecordKey,
} from "../../api/parentApi";
import { useRemoteResource } from "../../hooks/useRemoteResource";

export function PickupVerificationScreen({ route, navigation }: any) {
  const { selectedChild } = useChild();
  const childId = selectedChild?.id;
  const [guardianKey, setGuardianKey] = useState<string | null>(
    route?.params?.guardianKey ?? null,
  );
  const { data, loading, error, refresh } = useRemoteResource<{
    attendance: AttendanceRecord[];
    guardians: GuardianRecord[];
  }>(
    `pickup:${childId ?? "none"}`,
    async () => {
      if (!childId) return { attendance: [], guardians: [] };
      const [attendance, guardians] = await Promise.all([
        getChildAttendance(childId),
        getChildGuardians(childId),
      ]);
      return { attendance, guardians };
    },
    { attendance: [], guardians: [] },
  );
  const guardian =
    guardianKey === null
      ? data.guardians[0]
      : data.guardians.find((g) => guardianRecordKey(g) === guardianKey);
  const latest = [...data.attendance].sort(
    (a, b) => Date.parse(b.event_time) - Date.parse(a.event_time),
  )[0];
  const status =
    latest?.event_type === "checkout"
      ? "Checkout recorded"
      : latest?.event_type === "checkin"
        ? "Check-in recorded"
        : latest?.event_type === "absent"
          ? "Absence recorded"
          : "No attendance recorded";
  return (
    <Page
      title="Pickup status"
      subtitle="Guardian approval and recorded attendance."
      back
      tabs
      activeTab="Profile"
    >
      {!childId ? (
        <Notice>
          No child is linked to this account. Contact your daycare
          administrator.
        </Notice>
      ) : loading ? (
        <Card>
          <ActivityIndicator />
          <Text>Loading pickup records…</Text>
        </Card>
      ) : error ? (
        <>
          <Notice tone="error">{error}</Notice>
          <Button title="Retry" onPress={refresh} />
        </>
      ) : (
        <>
          <Card>
            <Text size={22} weight="semibold">
              {selectedChild?.full_name}
            </Text>
            <Badge title={status} tone="neutral" />
            {latest && (
              <Text size={13} style={{ marginTop: 12 }}>
                Last recorded: {new Date(latest.event_time).toLocaleString()}
                {latest.recorded_by_name ? ` · ${latest.recorded_by_name}` : ""}
              </Text>
            )}
          </Card>
          <Notice>
            Staff check an approved adult’s identity before releasing a child.
            This screen is a status summary, not a pickup pass. QR scanning and
            biometric device verification are not connected.
          </Notice>
          <Card>
            <Text size={19} weight="semibold">
              Guardian approval
            </Text>
            {data.guardians.length ? (
              <>
                <View style={{ gap: 8, marginVertical: 16 }}>
                  {data.guardians.map((g) => (
                    <Button
                      key={guardianRecordKey(g)}
                      title={g.name}
                      variant={
                        guardian && guardianRecordKey(g) === guardianRecordKey(guardian)
                          ? "primary"
                          : "outline"
                      }
                      onPress={() => setGuardianKey(guardianRecordKey(g))}
                    />
                  ))}
                </View>
                {guardian ? (
                  <>
                    <Text weight="semibold">{guardian.name}</Text>
                    <Text>{guardian.relationship}</Text>
                    <Badge
                      title={
                        guardian.pickup_authorized
                          ? "Pickup approved"
                          : guardian.status ? guardian.status.charAt(0).toUpperCase()+guardian.status.slice(1) : "Not authorized"
                      }
                      tone={guardian.pickup_authorized ? "green" : "gold"}
                    />
                    <Text size={13} style={{ marginTop: 12 }}>
                      This approval does not confirm that this adult performed
                      the last pickup. Staff record each release separately.
                    </Text>
                  </>
                ) : (
                  <Notice>
                    The selected guardian is no longer linked to this child.
                    Select a current guardian.
                  </Notice>
                )}
              </>
            ) : (
              <Text style={{ marginTop: 12 }}>
                No linked guardian records are available. Contact the daycare
                administrator.
              </Text>
            )}
          </Card>
        </>
      )}
      <View style={{ gap: 12, marginTop: 16 }}>
        <Button
          title="Refresh pickup records"
          icon={ShieldCheck}
          variant="secondary"
          onPress={refresh}
          disabled={loading || !childId}
        />
        <Button
          title="Attendance history"
          icon={Clock}
          onPress={() => navigation.navigate("AttendanceHistory")}
          disabled={!childId}
        />
        <Button
          title="Message daycare"
          icon={ChatCircle}
          variant="outline"
          onPress={() =>
            navigation.navigate("MainTabs", { screen: "Messages" })
          }
        />
      </View>
    </Page>
  );
}
