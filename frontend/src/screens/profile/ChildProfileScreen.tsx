import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, Pressable } from "react-native";
import { CalendarBlank } from "phosphor-react-native/src/icons/CalendarBlank";
import { ChatCircle } from "phosphor-react-native/src/icons/ChatCircle";
import { Heart } from "phosphor-react-native/src/icons/Heart";
import { UsersThree } from "phosphor-react-native/src/icons/UsersThree";
import { ForkKnife } from "phosphor-react-native/src/icons/ForkKnife";
import { ShieldCheck } from "phosphor-react-native/src/icons/ShieldCheck";
import { Phone } from "phosphor-react-native/src/icons/Phone";
import { Pill } from "phosphor-react-native/src/icons/Pill";
import { Warning } from "phosphor-react-native/src/icons/Warning";
import { PencilSimple } from "phosphor-react-native/src/icons/PencilSimple";
import { ArrowClockwise } from "phosphor-react-native/src/icons/ArrowClockwise";
import {
  Page,
  Text,
  Card,
  Avatar,
  Badge,
  Section,
  Button,
  s,
  Notice,
} from "../../components/design/System";
import { useRemoteResource } from "../../hooks/useRemoteResource";
import { artwork } from "../../theme/assets";
import { useAuth } from "../../context/AuthContext";
import { useChild } from "../../context/ChildContext";
import { getMyChild, FullChildProfile } from "../../api/parentApi";

export function ChildProfileScreen({ route, navigation }: any) {
  const { user } = useAuth();
  const { selectedChild } = useChild();
  const childId = route?.params?.childId || selectedChild?.id;

  const {
    data: profile,
    loading,
    error,
    refresh: loadData,
  } = useRemoteResource<FullChildProfile | null>(
    `child:${childId ?? "none"}`,
    () => (childId ? getMyChild(childId) : Promise.resolve(null)),
    null,
  );
  useEffect(() => {
    const remove = navigation.addListener?.("focus", loadData);
    return () => remove?.();
  }, [navigation, loadData]);
  if (!childId)
    return (
      <Page title="Child profile" back>
        <Notice>
          No child is linked to this account yet. Contact your daycare
          administrator.
        </Notice>
      </Page>
    );
  const childName = profile?.full_name || selectedChild?.full_name || "Child";
  const groupName =
    profile?.group_name || selectedChild?.group_name || "Daycare Group";

  // Calculate age string
  const formatAge = (dob?: string) => {
    if (!dob) return "";
    const birth = new Date(dob);
    const today = new Date();
    const years = today.getFullYear() - birth.getFullYear();
    return years > 0 ? `${years} years old` : "Under 1 year";
  };

  const allergies = (profile?.care_instructions || []).filter(
    (c) => c.category === "allergy",
  );
  const dietary = (profile?.care_instructions || []).filter(
    (c) => c.category === "dietary",
  );
  const medical = (profile?.care_instructions || []).filter(
    (c) => c.category === "medical_note",
  );
  const general = (profile?.care_instructions || []).filter(
    (c) => c.category === "general",
  );
  const contacts = profile?.emergency_contacts || [];

  return (
    <Page title="Child Profile" back tabs activeTab="Profile">
      {loading ? (
        <Card style={{ alignItems: "center", paddingVertical: 40 }}>
          <ActivityIndicator color="#061224" />
          <Text size={14} color="#858A93" style={{ marginTop: 12 }}>
            Loading profile…
          </Text>
        </Card>
      ) : error ? (
        <Card style={{ alignItems: "center", paddingVertical: 32 }}>
          <Notice tone="error">{error}</Notice>
          <Button
            title="Retry"
            icon={ArrowClockwise}
            onPress={loadData}
            style={{ marginTop: 16 }}
          />
        </Card>
      ) : (
        <>
          {/* Child Hero Card */}
          <Card style={{ alignItems: "center", paddingVertical: 28 }}>
            <Avatar source={profile?.photo_url ? {uri:profile.photo_url} : undefined} initials={childName.split(' ').map(n=>n[0]).join('').slice(0,2)} size={90} />
            <View style={{ marginTop: -5, marginBottom: 14 }}>
              <Badge
                title={
                  profile?.enrollment_status === "active"
                    ? "● Active Enrollment"
                    : "● Daycare Enrolled"
                }
              />
            </View>
            <Text size={23} weight="semibold">
              {childName}
            </Text>
            <Text size={13} color="#858A93" style={{ marginTop: 5 }}>
              {[formatAge(profile?.dob), groupName].filter(Boolean).join(" · ")}
            </Text>
            <View style={[s.row, { marginTop: 23, width: "100%" }]}>
              <Button
                title="Report"
                icon={CalendarBlank}
                onPress={() =>
                  navigation.navigate("FullDailyReport", { childId: childId })
                }
                style={{ flex: 1, minHeight: 45, paddingHorizontal: 10 }}
              />
              <Button
                title="Message"
                icon={ChatCircle}
                variant="secondary"
                onPress={() =>
                  navigation.navigate("MainTabs", { screen: "Messages" })
                }
                style={{
                  flex: 1,
                  minHeight: 45,
                  paddingHorizontal: 10,
                  backgroundColor: "#FFF4D5",
                }}
              />
            </View>
          </Card>

          {/* Edit Safety / Care Prompt */}
          <View style={{ marginTop: 16 }}>
            <Button
              title="Update Care, Allergies & Safety"
              icon={PencilSimple}
              variant="outline"
              onPress={() =>
                navigation.navigate("ChildProfileWizard", { childId })
              }
            />
          </View>

          {/* Basic Info */}
          <Section title="Basic Information" />
          <Card>
            <Text size={11} color="#89909B">
              DATE OF BIRTH
            </Text>
            <Text style={{ marginTop: 4 }}>
              {profile?.dob
                ? new Date(profile.dob).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "—"}
            </Text>
            <Text size={11} color="#89909B" style={{ marginTop: 18 }}>
              GENDER
            </Text>
            <Text style={{ marginTop: 4 }}>
              {profile?.gender
                ? profile.gender.charAt(0).toUpperCase() +
                  profile.gender.slice(1)
                : "—"}
            </Text>
            <Text size={11} color="#89909B" style={{ marginTop: 18 }}>
              DAYCARE GROUP
            </Text>
            <Text style={{ marginTop: 4 }}>{groupName}</Text>
          </Card>

          {/* Food Allergies Section */}
          <Section title="Allergies & Food Safety" />
          <Card>
            <View style={[s.row, { marginBottom: 12 }]}>
              <Warning size={20} color="#E76F51" weight="bold" />
              <Text weight="semibold" size={15} color="#1B2E24">
                Known Food Allergies
              </Text>
            </View>
            {allergies.length > 0 ? (
              allergies.map((a, idx) => (
                <View
                  key={a.id || idx}
                  style={{
                    backgroundColor: "#FDEDED",
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 8,
                    borderLeftWidth: 4,
                    borderLeftColor: "#E76F51",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Warning size={16} color="#A32420" weight="bold" />
                    <Text size={14} weight="semibold" color="#A32420">
                      {a.instruction_text}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text color="#7C838F" size={13}>
                No food allergies recorded.
              </Text>
            )}

            {dietary.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text size={11} color="#89909B" style={{ marginBottom: 6 }}>
                  DIETARY RESTRICTIONS
                </Text>
                {dietary.map((d, idx) => (
                  <View key={d.id || idx} style={[s.row, { marginBottom: 6 }]}>
                    <ForkKnife size={16} color="#B99A3E" />
                    <Text size={13} color="#2D3748">
                      {d.instruction_text}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Card>

          {/* Medical & Prescriptions */}
          <Section title="Medical & Medications" />
          <Card>
            <View style={[s.row, { marginBottom: 12 }]}>
              <Pill size={20} color="#6745AF" weight="bold" />
              <Text weight="semibold" size={15} color="#1B2E24">
                Prescriptions & Care Instructions
              </Text>
            </View>
            {medical.length > 0 ? (
              medical.map((m, idx) => (
                <View
                  key={m.id || idx}
                  style={{
                    backgroundColor: "#F1EDF6",
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 8,
                    borderLeftWidth: 4,
                    borderLeftColor: "#6745AF",
                  }}
                >
                  <Text size={13} color="#3B2668" weight="medium">
                    {m.instruction_text}
                  </Text>
                </View>
              ))
            ) : (
              <Text color="#7C838F" size={13}>
                No regular medications or medical conditions recorded.
              </Text>
            )}
          </Card>

          {/* Routine & Comfort Notes */}
          {general.length > 0 && (
            <>
              <Section title="Daily Routine & Notes" />
              <Card>
                {general.map((g, idx) => (
                  <View key={g.id || idx} style={{ marginBottom: 10 }}>
                    <Text size={13} color="#2D3748">
                      • {g.instruction_text}
                    </Text>
                  </View>
                ))}
              </Card>
            </>
          )}

          {/* Emergency Contacts */}
          <Section title="Emergency Contacts" />
          <Card>
            {contacts.length > 0 ? (
              contacts.map((c, idx) => (
                <View key={c.id || idx}>
                  <View style={[s.between, { paddingVertical: 8 }]}>
                    <View>
                      <Text weight="semibold" size={15}>
                        {c.name}
                      </Text>
                      <Text size={12} color="#858B96">
                        {c.relationship || "Contact"}
                      </Text>
                    </View>
                    <View
                      style={[
                        s.row,
                        {
                          backgroundColor: "#E8F5EE",
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 20,
                        },
                      ]}
                    >
                      <Phone size={14} color="#2D6A4F" />
                      <Text
                        size={13}
                        weight="semibold"
                        color="#2D6A4F"
                        style={{ marginLeft: 6 }}
                      >
                        {c.phone}
                      </Text>
                    </View>
                  </View>
                  {idx < contacts.length - 1 && <View style={s.divider} />}
                </View>
              ))
            ) : (
              <Text color="#7C838F" size={13}>
                No emergency contacts recorded.
              </Text>
            )}

            <Button
              title="View Authorized Pickups"
              icon={UsersThree}
              variant="outline"
              onPress={() => navigation.navigate("AuthorizedGuardians")}
              style={{ marginTop: 20 }}
            />
          </Card>
        </>
      )}
    </Page>
  );
}
