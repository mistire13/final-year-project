import React, { useState, useEffect, useCallback } from "react";
import { View, Pressable, ActivityIndicator, Linking } from "react-native";
import {
  ShieldCheck,
  Fingerprint,
  House,
  Check,
  QrCode,
  User,
  Phone,
  ChatCircle,
  WarningCircle,
  Clock,
  ArrowClockwise,
} from "phosphor-react-native";
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
import { useAuth } from "../../context/AuthContext";
import {
  getChildAttendance,
  getChildGuardians,
  AttendanceRecord,
  GuardianRecord,
} from "../../api/parentApi";

export function PickupVerificationScreen({ route, navigation }: any) {
  const { user } = useAuth();
  const { selectedChild } = useChild();
  const childId = selectedChild?.id || 1;
  const childFirst = selectedChild?.full_name ? selectedChild.full_name.split(" ")[0] : "your child";
  const childGroup = selectedChild?.group_name || "Daycare Classroom";

  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [guardians, setGuardians] = useState<GuardianRecord[]>([]);
  const [selectedGuardian, setSelectedGuardian] = useState<GuardianRecord | null>(null);

  const loadPickupData = useCallback(async () => {
    try {
      setLoading(true);
      const [attList, gList] = await Promise.all([
        getChildAttendance(childId).catch(() => []),
        getChildGuardians(childId).catch(() => []),
      ]);

      if (attList.length > 0) {
        setAttendance(attList[0]);
      } else {
        setAttendance(null);
      }

      setGuardians(gList);
      if (gList.length > 0) {
        const paramId = route?.params?.guardianId;
        const matched = paramId
          ? gList.find((g) => g.user_id === paramId || g.guardian_link_id === paramId)
          : gList[0];
        setSelectedGuardian(matched || gList[0]);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  }, [childId, route?.params?.guardianId]);

  useEffect(() => {
    loadPickupData();
    const unsubscribe = navigation.addListener?.("focus", loadPickupData);
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [navigation, loadPickupData]);

  // Determine actual lifecycle state
  const isCheckedIn = attendance?.event_type === "checkin";
  const isCheckedOut = attendance?.event_type === "checkout";
  const isAuthorized = selectedGuardian?.pickup_authorized ?? true;

  const currentStep = isCheckedOut ? 3 : isCheckedIn ? 2 : 1;

  const steps = [
    {
      title: "Guardian authorized",
      detail: isAuthorized
        ? `${selectedGuardian?.name || "Authorized guardian"} is approved to collect ${childFirst}.`
        : "Pending daycare administrative approval.",
      Icon: ShieldCheck,
      completed: isAuthorized,
      current: !isAuthorized,
    },
    {
      title: "Identity verified",
      detail: isCheckedOut
        ? "Verified at front desk before departure."
        : isCheckedIn
        ? "Front-desk staff scan QR or verify biometrics upon arrival."
        : "Awaiting arrival at daycare.",
      Icon: Fingerprint,
      completed: isCheckedOut,
      current: isCheckedIn && isAuthorized,
    },
    {
      title: "Checked out",
      detail: isCheckedOut
        ? `${childFirst} safely picked up and departed daycare.`
        : `Staff finalize release once identity is confirmed.`,
      Icon: House,
      completed: isCheckedOut,
      current: false,
    },
  ];

  // Dynamic token for QR pass
  const passCode = `ANK-${childId}-${selectedGuardian?.user_id || 101}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

  return (
    <Page
      title="Pickup Status & Pass"
      subtitle={`Authorized collection pass for ${childFirst}.`}
      back
      tabs
      activeTab="Profile"
    >
      {/* Child Status Hero */}
      <Card tint="#F1F5EC" style={{ marginBottom: 16 }}>
        <View style={[s.row, { flexWrap: "wrap", gap: 10 }]}>
          <Avatar source={artwork.child} size={58} />
          <View style={{ flex: 1, minWidth: 100 }}>
            <Text size={20} weight="semibold">
              {selectedChild?.full_name || childFirst}
            </Text>
            <Text size={12} color="#687C72">
              {childGroup}
            </Text>
          </View>
          <Badge
            title={isCheckedOut ? "Checked Out" : isCheckedIn ? "● At Daycare" : "Not Checked In"}
            tone={isCheckedOut ? "neutral" : isCheckedIn ? "green" : "gold"}
          />
        </View>
      </Card>

      {/* Digital Pickup Pass / QR Code Card (SRS FR-BIO-04–08, UI-05) */}
      <Card
        style={{
          backgroundColor: "#FFFFFF",
          borderColor: "#061224",
          borderWidth: 2,
          padding: 20,
          marginBottom: 18,
          borderRadius: 24,
          alignItems: "center",
        }}
      >
        <View style={[s.between, { width: "100%", marginBottom: 14 }]}>
          <View style={s.row}>
            <ShieldCheck size={18} color="#061224" weight="fill" />
            <Text size={12} weight="bold" color="#061224" style={{ marginLeft: 6 }}>
              DIGITAL PICKUP PASS
            </Text>
          </View>
          <Badge title="Valid Today" tone="green" />
        </View>

        {/* QR Code Presentation Box */}
        <View
          style={{
            width: 170,
            height: 170,
            backgroundColor: "#F7F8FA",
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "#D9DEE4",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
            marginVertical: 8,
          }}
        >
          {/* Stylized QR Visual Representation */}
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            <QrCode size={130} color="#061224" weight="bold" />
          </View>
        </View>

        <Text size={15} weight="bold" color="#061224" style={{ letterSpacing: 1.2, marginTop: 8 }}>
          {passCode}
        </Text>

        <Text size={12} color="#667280" style={{ textAlign: "center", marginTop: 6, lineHeight: 17 }}>
          Present this pass at the daycare reception desk. Staff verify authorized adult identity before releasing {childFirst}.
        </Text>

        {/* Guardian Selector Chips if multiple guardians */}
        {guardians.length > 1 && (
          <View style={{ marginTop: 14, width: "100%" }}>
            <Text size={11} color="#858D9A" style={{ marginBottom: 6, textAlign: "center" }}>
              COLLECTING GUARDIAN:
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              {guardians.map((g) => {
                const isSel = g.guardian_link_id === selectedGuardian?.guardian_link_id;
                return (
                  <Pressable
                    key={g.guardian_link_id}
                    onPress={() => setSelectedGuardian(g)}
                    style={{
                      paddingVertical: 5,
                      paddingHorizontal: 12,
                      borderRadius: 14,
                      backgroundColor: isSel ? "#061224" : "#F0EFEA",
                    }}
                  >
                    <Text size={11} weight={isSel ? "bold" : "medium"} color={isSel ? "#fff" : "#444"}>
                      {g.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </Card>

      {/* 3-Step Pickup Journey */}
      <Card style={{ padding: 20, marginBottom: 18 }}>
        <Text size={18} weight="semibold" style={{ marginBottom: 18 }}>
          Pickup Verification Journey
        </Text>

        {steps.map(({ title, detail, Icon, completed, current }, index) => {
          const ink = completed ? "#3D795A" : current ? "#8A6A25" : "#7C8490";
          return (
            <View key={title} style={{ flexDirection: "row", gap: 16 }}>
              <View style={{ width: 42, alignItems: "center" }}>
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 21,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: completed
                      ? "#E8F3E9"
                      : current
                      ? "#FFF2CC"
                      : "#F2F1F3",
                    borderWidth: current ? 1.5 : 0,
                    borderColor: "#D1B366",
                  }}
                >
                  {completed ? (
                    <Check size={22} color={ink} weight="bold" />
                  ) : (
                    <Icon size={22} color={ink} />
                  )}
                </View>
                {index < steps.length - 1 && (
                  <View
                    style={{
                      width: 2,
                      flex: 1,
                      minHeight: 40,
                      backgroundColor: completed ? "#AECDB6" : "#E9E7EA",
                      marginVertical: 4,
                    }}
                  />
                )}
              </View>
              <View
                style={{
                  flex: 1,
                  paddingTop: 2,
                  paddingBottom: index < 2 ? 24 : 0,
                }}
              >
                <Text size={15} weight="semibold">
                  {title}
                </Text>
                <Text
                  size={12}
                  color="#727E89"
                  style={{ marginTop: 4, lineHeight: 18 }}
                >
                  {detail}
                </Text>
                <Text
                  size={11}
                  weight="semibold"
                  color={ink}
                  style={{ marginTop: 6 }}
                >
                  {completed
                    ? "✓ Complete"
                    : current
                    ? "● In Progress at Front Desk"
                    : "Waiting"}
                </Text>
              </View>
            </View>
          );
        })}
      </Card>

      {/* Selected Guardian Info Card */}
      {selectedGuardian && (
        <Card style={{ marginBottom: 18, padding: 16 }}>
          <View style={s.row}>
            <Avatar
              initials={selectedGuardian.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
              size={48}
            />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text size={11} color="#858D9A" style={{ letterSpacing: 0.5 }}>
                CONFIRMED PICKUP ADULT
              </Text>
              <Text size={16} weight="semibold" style={{ marginTop: 2 }}>
                {selectedGuardian.name}
              </Text>
              <Text size={12} color="#727E89">
                {selectedGuardian.relationship || "Parent"} · {selectedGuardian.email || "On File"}
              </Text>
            </View>
            {selectedGuardian.biometric_enrolled && (
              <View
                style={{
                  padding: 8,
                  borderRadius: 12,
                  backgroundColor: "#E8F6F3",
                }}
              >
                <Fingerprint size={22} color="#008794" />
              </View>
            )}
          </View>
        </Card>
      )}

      {/* Help Actions */}
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
        <Button
          title="Message Daycare"
          icon={ChatCircle}
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() => navigation.navigate("MainTabs", { screen: "Messages" })}
        />
        <Button
          title="Attendance Log"
          icon={Clock}
          variant="outline"
          style={{ flex: 1, backgroundColor: "#fff" }}
          onPress={() => navigation.navigate("AttendanceHistory")}
        />
      </View>
    </Page>
  );
}
