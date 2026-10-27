import React, { useState, useEffect, useCallback } from "react";
import { View, ActivityIndicator } from "react-native";
import { ShieldCheck } from "phosphor-react-native/src/icons/ShieldCheck";
import { UserPlus } from "phosphor-react-native/src/icons/UserPlus";
import { Fingerprint } from "phosphor-react-native/src/icons/Fingerprint";
import { Users } from "phosphor-react-native/src/icons/Users";
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
import { getChildGuardians, guardianRecordKey, GuardianRecord } from "../../api/parentApi";
import {useRemoteResource} from '../../hooks/useRemoteResource';

export function AuthorizedGuardiansScreen({ navigation }: any) {
  const { selectedChild } = useChild();
  const {data:guardians,error,loading,refresh:loadGuardians}=useRemoteResource<GuardianRecord[]>(
    `guardians:${selectedChild?.id||'none'}`,()=>selectedChild?.id?getChildGuardians(selectedChild.id):Promise.resolve([]),[]);

  useEffect(() => {
    const unsubscribe = navigation.addListener?.("focus", loadGuardians);
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [navigation, loadGuardians]);

  const childName = selectedChild?.full_name?.split(" ")[0] || "Child";
  const groupName = selectedChild?.group_name || "Early Learning";

  return (
    <Page
      title="Authorized Guardians"
      subtitle={`Pickup contacts and approval requests for ${childName}.`}
      back
      tabs
      activeTab="Profile"
    >
      {error ? <><Notice tone="error">{error}</Notice><Button title="Retry" onPress={loadGuardians}/></> : null}
      {!selectedChild ? <Notice>Select a linked child to view guardians.</Notice> : null}
      <Card style={{ padding: 16 }}>
        <View style={s.row}>
          <Avatar source={selectedChild?.photo_url ? {uri:selectedChild.photo_url} : undefined} initials={childName.slice(0, 2).toUpperCase()} size={48} />
          <View style={{ marginLeft: 12 }}>
            <Text size={18} weight="semibold">
              {selectedChild?.full_name || "Child Profile"}
            </Text>
            <Text size={12} color="#828995">
              {groupName} · {selectedChild?.enrollment_status ? selectedChild.enrollment_status.toUpperCase() : "ENROLLED"}
            </Text>
          </View>
        </View>
      </Card>

      <Notice>
        Only adults approved by daycare administration may complete pickup. Staff check their identity at the daycare.
      </Notice>

      {loading ? (
        <View style={{ paddingVertical: 30, alignItems: "center" }}>
          <ActivityIndicator size="small" color="#061224" />
          <Text size={13} color="#8A919B" style={{ marginTop: 10 }}>
            Loading authorized guardians…
          </Text>
        </View>
      ) : guardians.length > 0 ? (
        guardians.map((g) => (
          <Card
            key={guardianRecordKey(g)}
            onPress={() =>
              navigation.navigate("GuardianDetails", {
                guardian: g,
                guardianKey: guardianRecordKey(g),
              })
            }
            style={{ marginBottom: 14, padding: 18 }}
          >
            <View style={s.row}>
              <Avatar
                initials={g.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
                size={46}
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text size={16} weight="medium">
                  {g.name}
                </Text>
                <Text size={11} color="#8A919B" style={{ letterSpacing: 0.5 }}>
                  {g.relationship ? g.relationship.toUpperCase() : "GUARDIAN"}
                </Text>
              </View>
              <Badge
                title={g.pickup_authorized ? "● Authorized" : g.status ? g.status.charAt(0).toUpperCase()+g.status.slice(1) : "Not authorized"}
                tone={g.pickup_authorized ? "green" : "gold"}
              />
            </View>

            <View style={[s.between, { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#EDEAE4" }]}>
              <View style={s.row}>
                <Fingerprint
                  size={16}
                  color={g.biometric_enrolled ? "#2B8A3E" : "#B79D52"}
                />
                <Text
                  size={12}
                  color={g.biometric_enrolled ? "#2B8A3E" : "#B79D52"}
                  weight="medium"
                  style={{ marginLeft: 6 }}
                >
                  {g.biometric_enrolled ? "Biometric Enrolled" : "No biometric enrollment recorded"}
                </Text>
              </View>
              <Text size={12} color="#10263D" weight="semibold">
                Details ›
              </Text>
            </View>
          </Card>
        ))
      ) : (
        <Card style={{ padding: 24, alignItems: "center" }}>
          <Users size={40} color="#9EA3AC" />
          <Text size={16} weight="semibold" style={{ marginTop: 12 }}>
            No Guardians Registered Yet
          </Text>
          <Text size={13} color="#7D838C" style={{ marginTop: 6, textAlign: "center" }}>
            Contact the daycare office to link secondary guardians or authorized pickup delegates.
          </Text>
        </Card>
      )}

      <Button
        title="Register New Guardian"
        icon={UserPlus}
        onPress={() => navigation.navigate("AddGuardian")}
        style={{ marginTop: 8 }}
      />

      <Card tint="#F4F5F7" style={{ marginTop: 24, alignItems: "center", padding: 18 }}>
        <ShieldCheck color="#236B8E" size={28} />
        <Text weight="medium" size={15} style={{ marginTop: 10 }}>
          About Guardian Verification
        </Text>
        <Text
          size={12}
          color="#666F7C"
          style={{ textAlign: "center", marginTop: 8, lineHeight: 18 }}
        >
          Staff confirm guardian approval and identity at pickup. Biometric device verification is not connected.
        </Text>
      </Card>
    </Page>
  );
}
