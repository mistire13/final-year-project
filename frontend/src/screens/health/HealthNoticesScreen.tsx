import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Heart } from "phosphor-react-native/src/icons/Heart";
import { Warning } from "phosphor-react-native/src/icons/Warning";
import { FirstAid } from "phosphor-react-native/src/icons/FirstAid";
import { Clock } from "phosphor-react-native/src/icons/Clock";
import { ChatCircle } from "phosphor-react-native/src/icons/ChatCircle";
import { ShieldCheck } from "phosphor-react-native/src/icons/ShieldCheck";
import { ArrowClockwise } from "phosphor-react-native/src/icons/ArrowClockwise";
import { User } from "phosphor-react-native/src/icons/User";
import { Info } from "phosphor-react-native/src/icons/Info";
import {
  Page,
  Text,
  Card,
  Avatar,
  Badge,
  Button,
  Notice,
  s,
} from "../../components/design/System";
import { useRemoteResource } from "../../hooks/useRemoteResource";
import { artwork } from "../../theme/assets";
import { useChild } from "../../context/ChildContext";
import { getChildHealth, HealthRecord } from "../../api/parentApi";

export function HealthNoticesScreen({ navigation, route }: any) {
  const { selectedChild:activeChild, childrenList } = useChild();
  const childId = route?.params?.childId || activeChild?.id;
  const selectedChild=childrenList.find(c=>c.id===childId)||(activeChild?.id===childId?activeChild:null);
  const childName = selectedChild?.full_name
    ? selectedChild.full_name.split(" ")[0]
    : "Your Child";
  const groupName = selectedChild?.group_name || "Daycare Classroom";

  const [filter, setFilter] = useState<"All" | "health" | "incident">("All");
  const {
    data: result,
    loading,
    error,
    refresh: loadHealthData,
  } = useRemoteResource<{ data: HealthRecord[]; disclaimer?: string }>(
    `health:${childId ?? "none"}`,
    () => (childId ? getChildHealth(childId) : Promise.resolve({ data: [] })),
    { data: [] },
  );
  const records = result.data;
  const disclaimer =
    result.disclaimer ||
    "Reporting functionality only. This record does not constitute medical diagnosis or advice.";
  const refreshing = loading;
  const onRefresh = loadHealthData;
  useEffect(() => {
    const remove = navigation.addListener?.("focus", loadHealthData);
    return () => remove?.();
  }, [navigation, loadHealthData]);
  if (!childId)
    return (
      <Page title="Health records" back>
        <Notice>No child is linked to this account yet.</Notice>
      </Page>
    );

  const filteredRecords = records.filter((r) => {
    if (filter === "All") return true;
    if (filter === "health")
      return (
        r.record_type === "health" ||
        (r.record_type as string) === "health_observation"
      );
    return r.record_type === filter;
  });

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getSeverityTone = (
    sev?: string,
  ): "green" | "gold" | "red" | "neutral" => {
    switch (sev) {
      case "high":
        return "red";
      case "moderate":
        return "gold";
      case "low":
        return "green";
      default:
        return "neutral";
    }
  };

  return (
    <Page
      title="Health & Incidents"
      subtitle={`Observations and staff updates for ${childName}.`}
      back
      tabs
      activeTab="Profile"
    >
      {/* Child Header Card */}
      <Card tint="#F3F1F8" style={{ marginBottom: 16, padding: 16 }}>
        <View style={s.row}>
          <Avatar source={selectedChild?.photo_url?{uri:selectedChild.photo_url}:undefined} initials={selectedChild?.full_name?.slice(0,2).toUpperCase()||'CH'} size={54} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text size={18} weight="semibold">
              {selectedChild?.full_name || childName}
            </Text>
            <Text size={12} color="#747B87">
              {groupName} · Care Record
            </Text>
          </View>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "#FFF0F0",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Heart size={20} color="#D64545" weight="fill" />
          </View>
        </View>
      </Card>

      {/* Mandatory SRS Medical Disclaimer Banner (FR-HIR-06, BR-03) */}
      <Card
        style={{
          backgroundColor: "#FFF8EB",
          borderColor: "#F2D8A7",
          borderWidth: 1,
          marginBottom: 20,
          padding: 14,
        }}
      >
        <View style={[s.row, { alignItems: "flex-start" }]}>
          <Info
            size={20}
            color="#B26A00"
            style={{ marginTop: 2, marginRight: 10 }}
          />
          <View style={{ flex: 1 }}>
            <Text size={12} weight="bold" color="#8C5300">
              NON-DIAGNOSTIC NOTICE
            </Text>
            <Text
              size={12}
              color="#7A4B06"
              style={{ marginTop: 3, lineHeight: 17 }}
            >
              {disclaimer} Staff log factual day-to-day observations for parent
              awareness.
            </Text>
          </View>
        </View>
      </Card>

      {/* Filter Tabs */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 18 }}>
        {[
          { label: "All Records", val: "All" },
          { label: "Observations", val: "health" },
          { label: "Incidents", val: "incident" },
        ].map((f) => {
          const isSelected = filter === f.val;
          return (
            <Pressable
              key={f.val}
              onPress={() => setFilter(f.val as any)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 20,
                backgroundColor: isSelected ? "#061224" : "#EDEAE3",
              }}
            >
              <Text
                size={12}
                weight={isSelected ? "bold" : "medium"}
                color={isSelected ? "#FFFFFF" : "#555E69"}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Content Stream */}
      {loading ? (
        <Card style={{ alignItems: "center", paddingVertical: 40 }}>
          <ActivityIndicator color="#061224" />
          <Text size={13} color="#858A93" style={{ marginTop: 12 }}>
            Loading health records…
          </Text>
        </Card>
      ) : error ? (
        <Card style={{ alignItems: "center", paddingVertical: 32 }}>
          <Notice tone="error">{error}</Notice>
          <Button
            title="Retry"
            icon={ArrowClockwise}
            onPress={loadHealthData}
            style={{ marginTop: 16 }}
          />
        </Card>
      ) : filteredRecords.length > 0 ? (
        filteredRecords.map((item) => {
          const isIncident = item.record_type === "incident";
          return (
            <Card
              key={item.id}
              style={{
                marginBottom: 14,
                padding: 18,
                borderLeftWidth: 4,
                borderLeftColor: isIncident ? "#D64545" : "#008794",
              }}
            >
              <View style={[s.between, { flexWrap: "wrap", gap: 6 }]}>
                <View style={s.row}>
                  {isIncident ? (
                    <Warning size={18} color="#D64545" weight="fill" />
                  ) : (
                    <FirstAid size={18} color="#008794" weight="fill" />
                  )}
                  <Text size={13} weight="bold" style={{ marginLeft: 6 }}>
                    {isIncident ? "UNUSUAL INCIDENT" : "HEALTH OBSERVATION"}
                  </Text>
                </View>

                <View style={s.row}>
                  {item.severity && (
                    <Badge
                      title={`Severity: ${item.severity.toUpperCase()}`}
                      tone={getSeverityTone(item.severity)}
                    />
                  )}
                  {item.parent_notified && (
                    <Badge title="✓ Notified" tone="green" />
                  )}
                </View>
              </View>

              <Text
                size={14}
                color="#10263D"
                style={{ marginTop: 12, lineHeight: 21 }}
              >
                {item.description}
              </Text>

              <View
                style={[
                  s.between,
                  {
                    marginTop: 14,
                    borderTopWidth: 1,
                    borderTopColor: "#EDEAE4",
                    paddingTop: 10,
                  },
                ]}
              >
                <View style={s.row}>
                  <User size={14} color="#7E8793" />
                  <Text size={12} color="#7E8793" style={{ marginLeft: 4 }}>
                    {item.recorded_by_name || "Daycare Caregiver"}
                  </Text>
                </View>

                <View style={s.row}>
                  <Clock size={14} color="#7E8793" />
                  <Text size={12} color="#7E8793" style={{ marginLeft: 4 }}>
                    {formatDateTime(item.recorded_at)}
                  </Text>
                </View>
              </View>

              <Button
                title="Message Caregiver About This"
                icon={ChatCircle}
                variant="outline"
                style={{ marginTop: 14, backgroundColor: "#FFFFFF" }}
                onPress={() =>
                  navigation.navigate("MainTabs", { screen: "Messages" })
                }
              />
            </Card>
          );
        })
      ) : (
        <Card
          style={{
            alignItems: "center",
            paddingVertical: 40,
            paddingHorizontal: 24,
          }}
        >
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              backgroundColor: "#E8F6F3",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <ShieldCheck size={32} color="#008794" weight="fill" />
          </View>
          <Text
            size={18}
            weight="semibold"
            style={{ textAlign: "center", marginBottom: 6 }}
          >
            No health updates recorded
          </Text>
          <Text
            size={13}
            color="#7A828E"
            style={{ textAlign: "center", lineHeight: 19 }}
          >
            No health observations or incident flags have been recorded for{" "}
            {childName}. Caregivers log any temperature checks, bumps, or minor
            notes here immediately.
          </Text>
        </Card>
      )}
    </Page>
  );
}
