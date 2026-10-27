import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { CalendarBlank } from "phosphor-react-native/src/icons/CalendarBlank";
import { Clock } from "phosphor-react-native/src/icons/Clock";
import { CheckCircle } from "phosphor-react-native/src/icons/CheckCircle";
import { SignOut } from "phosphor-react-native/src/icons/SignOut";
import { House } from "phosphor-react-native/src/icons/House";
import { WarningCircle } from "phosphor-react-native/src/icons/WarningCircle";
import { ArrowClockwise } from "phosphor-react-native/src/icons/ArrowClockwise";
import { User } from "phosphor-react-native/src/icons/User";
import { ShieldCheck } from "phosphor-react-native/src/icons/ShieldCheck";
import { QrCode } from "phosphor-react-native/src/icons/QrCode";
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
import { getChildAttendance, AttendanceRecord } from "../../api/parentApi";

export function AttendanceHistoryScreen({ navigation, route }: any) {
  const { selectedChild:activeChild, childrenList } = useChild();
  const childId = route?.params?.childId || activeChild?.id;
  const selectedChild=childrenList.find(c=>c.id===childId)||(activeChild?.id===childId?activeChild:null);
  const childName = selectedChild?.full_name
    ? selectedChild.full_name.split(" ")[0]
    : "Your Child";
  const groupName = selectedChild?.group_name || "Daycare Classroom";

  const [filter, setFilter] = useState<
    "All" | "checkin" | "checkout" | "absent"
  >("All");
  const {
    data: records,
    loading,
    error,
    refresh: loadAttendance,
  } = useRemoteResource<AttendanceRecord[]>(
    `attendance:${childId ?? "none"}`,
    () => (childId ? getChildAttendance(childId) : Promise.resolve([])),
    [],
  );
  const refreshing = loading;
  const onRefresh = loadAttendance;
  useEffect(() => {
    const remove = navigation.addListener?.("focus", loadAttendance);
    return () => remove?.();
  }, [navigation, loadAttendance]);
  if (!childId)
    return (
      <Page title="Attendance history" back>
        <Notice>No child is linked to this account yet.</Notice>
      </Page>
    );

  const filteredRecords = records.filter((r) => {
    if (filter === "All") return true;
    return r.event_type === filter;
  });

  // Calculate metrics
  const checkins = records.filter((r) => r.event_type === "checkin").length;
  const checkouts = records.filter((r) => r.event_type === "checkout").length;
  const absences = records.filter((r) => r.event_type === "absent").length;

  const formatDate = (isoString?: string) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  const getEventBadge = (type: string) => {
    switch (type) {
      case "checkin":
        return <Badge title="● Arrived at Daycare" tone="green" />;
      case "checkout":
        return <Badge title="✓ Picked Up & Departed" tone="neutral" />;
      case "absent":
        return <Badge title="● Marked Absent" tone="gold" />;
      default:
        return <Badge title={type} tone="neutral" />;
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case "checkin":
        return (
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "#E8F5E9",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CheckCircle size={20} color="#2E7D32" weight="fill" />
          </View>
        );
      case "checkout":
        return (
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "#E3F2FD",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <House size={20} color="#1565C0" weight="fill" />
          </View>
        );
      case "absent":
        return (
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "#FFF8E1",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <WarningCircle size={20} color="#F57F17" weight="fill" />
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <Page
      title="Attendance History"
      subtitle={`Daily check-in, departure, and absence log for ${childName}.`}
      back
      tabs
      activeTab="Home"
    >
      {/* Child Card with Pickup Pass shortcut */}
      <Card tint="#F4F6EE" style={{ marginBottom: 18, padding: 16 }}>
        <View style={s.row}>
          <Avatar source={selectedChild?.photo_url?{uri:selectedChild.photo_url}:undefined} initials={selectedChild?.full_name?.slice(0,2).toUpperCase()||'CH'} size={54} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text size={18} weight="semibold">
              {selectedChild?.full_name || childName}
            </Text>
            <Text size={12} color="#747B87">
              {groupName} · Enrolled
            </Text>
          </View>
          <Button
            title="Pickup status"
            icon={QrCode}
            variant="secondary"
            style={{ minHeight: 38, paddingVertical: 6, paddingHorizontal: 12 }}
            onPress={() => navigation.navigate("PickupVerification")}
          />
        </View>
      </Card>

      {/* Summary KPI Cards */}
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
        <Card
          style={{
            flex: 1,
            padding: 14,
            alignItems: "center",
            backgroundColor: "#EAF5EE",
          }}
        >
          <Text size={22} weight="bold" color="#236B3D">
            {checkins}
          </Text>
          <Text
            size={11}
            color="#357D4F"
            weight="semibold"
            style={{ marginTop: 2 }}
          >
            Check-ins
          </Text>
        </Card>

        <Card
          style={{
            flex: 1,
            padding: 14,
            alignItems: "center",
            backgroundColor: "#EBF1FA",
          }}
        >
          <Text size={22} weight="bold" color="#1A4A7A">
            {checkouts}
          </Text>
          <Text
            size={11}
            color="#2A5B8D"
            weight="semibold"
            style={{ marginTop: 2 }}
          >
            Departures
          </Text>
        </Card>

        <Card
          style={{
            flex: 1,
            padding: 14,
            alignItems: "center",
            backgroundColor: "#FEF7E6",
          }}
        >
          <Text size={22} weight="bold" color="#9C6B10">
            {absences}
          </Text>
          <Text
            size={11}
            color="#A77416"
            weight="semibold"
            style={{ marginTop: 2 }}
          >
            Absences
          </Text>
        </Card>
      </View>

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 18, flexGrow: 0 }}
        contentContainerStyle={{ gap: 8 }}
      >
        {[
          { label: "All Events", val: "All" },
          { label: "Arrivals", val: "checkin" },
          { label: "Departures", val: "checkout" },
          { label: "Absences", val: "absent" },
        ].map((f) => {
          const isSelected = filter === f.val;
          return (
            <Pressable
              key={f.val}
              onPress={() => setFilter(f.val as any)}
              style={{
                paddingVertical: 7,
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
      </ScrollView>

      {/* Events Timeline */}
      {loading ? (
        <Card style={{ alignItems: "center", paddingVertical: 40 }}>
          <ActivityIndicator color="#061224" />
          <Text size={13} color="#858A93" style={{ marginTop: 12 }}>
            Loading attendance records…
          </Text>
        </Card>
      ) : error ? (
        <Card style={{ alignItems: "center", paddingVertical: 32 }}>
          <Notice tone="error">{error}</Notice>
          <Button
            title="Retry"
            icon={ArrowClockwise}
            onPress={loadAttendance}
            style={{ marginTop: 16 }}
          />
        </Card>
      ) : filteredRecords.length > 0 ? (
        filteredRecords.map((item) => (
          <Card key={item.id} style={{ marginBottom: 12, padding: 16 }}>
            <View style={[s.row, { alignItems: "flex-start" }]}>
              {getEventIcon(item.event_type)}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={[s.between, { flexWrap: "wrap", gap: 6 }]}>
                  <Text size={15} weight="semibold">
                    {formatDate(item.event_time)}
                  </Text>
                  {getEventBadge(item.event_type)}
                </View>

                <View style={[s.row, { marginTop: 6 }]}>
                  <Clock size={14} color="#7E8793" />
                  <Text size={13} color="#6F7783" style={{ marginLeft: 6 }}>
                    Time: {formatTime(item.event_time)}
                  </Text>
                </View>

                {item.recorded_by_name && (
                  <View style={[s.row, { marginTop: 4 }]}>
                    <User size={14} color="#7E8793" />
                    <Text size={12} color="#858D9A" style={{ marginLeft: 6 }}>
                      Staff: {item.recorded_by_name}
                    </Text>
                  </View>
                )}

                {item.notes ? (
                  <Text
                    size={12}
                    color="#555E69"
                    style={{ marginTop: 8, fontStyle: "italic" }}
                  >
                    “{item.notes}”
                  </Text>
                ) : null}
              </View>
            </View>
          </Card>
        ))
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
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: "#F2F4F7",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 14,
            }}
          >
            <CalendarBlank size={30} color="#798290" />
          </View>
          <Text
            size={18}
            weight="semibold"
            style={{ textAlign: "center", marginBottom: 6 }}
          >
            No Attendance Events Found
          </Text>
          <Text
            size={13}
            color="#7A828E"
            style={{ textAlign: "center", lineHeight: 19 }}
          >
            No check-in or checkout records match the selected filter. As
            daycare staff log attendance events, they appear here instantly.
          </Text>
        </Card>
      )}
    </Page>
  );
}
