import React, { useEffect } from "react";
import { View } from "react-native";
import { Fingerprint } from "phosphor-react-native/src/icons/Fingerprint";
import { Check } from "phosphor-react-native/src/icons/Check";
import { ShieldCheck } from "phosphor-react-native/src/icons/ShieldCheck";
import { EnvelopeSimple } from "phosphor-react-native/src/icons/EnvelopeSimple";
import {
  Page,
  Text,
  Card,
  Avatar,
  Badge,
  Notice,
  Button,
  s,
} from "../../components/design/System";
import { artwork } from "../../theme/assets";
import { useChild } from "../../context/ChildContext";
import { GuardianRecord, guardianRecordKey, getChildGuardians } from "../../api/parentApi";
import { useRemoteResource } from "../../hooks/useRemoteResource";

export function GuardianDetailsScreen({ navigation, route }: any) {
  const { selectedChild } = useChild();
  const initial: GuardianRecord | undefined = route.params?.guardian;
  const key = initial ? guardianRecordKey(initial) : "none";
  const {data:guardian,loading,error,refresh} = useRemoteResource<GuardianRecord | undefined>(
    `guardian:${selectedChild?.id}:${key}`,
    async()=>selectedChild ? (await getChildGuardians(selectedChild.id)).find(g=>guardianRecordKey(g)===key) : undefined,
    undefined,
  );
  useEffect(()=>navigation.addListener?.("focus",refresh),[navigation,refresh]);

  if (loading || error) return <Page title="Guardian Details" back><Notice tone={error?"error":"neutral"}>{error || "Loading current guardian approval…"}</Notice>{error?<Button title="Retry" onPress={refresh}/>:null}</Page>;

  if (!guardian) {
    return (
      <Page title="Guardian Details" back>
        <Notice tone="error">Guardian details are currently unavailable.</Notice>
        <Button
          title="Back to Guardians"
          variant="secondary"
          onPress={() => navigation.goBack()}
          style={{ marginTop: 16 }}
        />
      </Page>
    );
  }

  const childName = selectedChild?.full_name || "Enrolled Child";
  const groupName = selectedChild?.group_name || "Early Learning";

  return (
    <Page title="Guardian Details" back tabs activeTab="Profile">
      <Card tint="#F4F5F8" style={{ alignItems: "center", paddingVertical: 24 }}>
        <Avatar
          initials={guardian.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
          size={84}
        />
        <Text size={22} weight="semibold" style={{ marginTop: 14 }}>
          {guardian.name}
        </Text>
        <Text color="#6E7682" size={14} style={{ marginTop: 2 }}>
          {guardian.relationship || "Authorized Guardian"}
        </Text>
        <View
          style={[
            s.row,
            { marginTop: 14, flexWrap: "wrap", justifyContent: "center", gap: 8 },
          ]}
        >
          <Badge
            title={guardian.pickup_authorized ? "Pickup Authorized" : guardian.status ? guardian.status.charAt(0).toUpperCase()+guardian.status.slice(1) : "Not authorized"}
            tone={guardian.pickup_authorized ? "green" : "gold"}
          />
          <Badge
            title={guardian.biometric_enrolled ? "Biometric Enrolled" : "Biometric device not connected"}
            tone={guardian.biometric_enrolled ? "neutral" : "gold"}
          />
        </View>
      </Card>

      <Card style={{ marginTop: 18, padding: 16 }}>
        <View style={s.row}>
          <Avatar source={selectedChild?.photo_url?{uri:selectedChild.photo_url}:undefined} initials={childName.slice(0,2).toUpperCase()} size={44} />
          <View style={{ marginLeft: 12 }}>
            <Text size={10} color="#8A919B" style={{ letterSpacing: 0.5 }}>
              ASSOCIATED CHILD
            </Text>
            <Text size={16} weight="medium">
              {childName} · {groupName}
            </Text>
          </View>
        </View>
      </Card>

      <Card style={{ marginTop: 18, padding: 18 }}>
        <Text size={16} weight="semibold" style={{ marginBottom: 14 }}>
          Contact Information
        </Text>
        <View style={[s.row, { marginBottom: 12 }]}>
          <EnvelopeSimple size={18} color="#6C7380" />
          <View style={{ marginLeft: 10 }}>
            <Text size={11} color="#8A919B">EMAIL ADDRESS</Text>
            <Text size={14} weight="medium">{guardian.email || "No email on record"}</Text>
          </View>
        </View>
        {guardian.phone ? <Text size={14}>Phone: {guardian.phone}</Text> : null}
        {guardian.review_note ? <Text size={13} style={{marginTop:12}}>Daycare decision: {guardian.review_note}</Text> : null}
        {guardian.pickup_guardian_id ? <Text size={12} style={{marginTop:12}}>Pickup contact only. This record does not grant parent-app access.</Text> : null}
      </Card>

      <Notice tone={guardian.biometric_enrolled ? "success" : "neutral"}>
        {guardian.biometric_enrolled
          ? "Biometric enrollment is recorded. Pickup permission is shown separately above; staff must verify identity."
          : "Staff verify identity and pickup permission at the daycare. Biometric device verification is not connected."}
      </Notice>

      <Button
        title="View Pickup Status & History"
        variant="outline"
        onPress={() =>
          navigation.navigate("PickupVerification", { guardianKey: guardianRecordKey(guardian) })
        }
        style={{ marginTop: 16 }}
      />
    </Page>
  );
}
