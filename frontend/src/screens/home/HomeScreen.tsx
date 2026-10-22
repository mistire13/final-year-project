import React, { useEffect, useState, useCallback } from "react";
import { View, Image, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import {
  ChatCircle,
  FileText,
  Robot,
  CalendarBlank,
  ForkKnife,
  Moon,
  PuzzlePiece,
  Car,
  Smiley,
  Eye,
  Palette,
  ArrowRight,
  ArrowBendUpLeft,
  Warning,
  Clock,
  Heart,
  SpeakerHigh,
} from "phosphor-react-native";
import {
  Page,
  Text,
  Card,
  CardGlow,
  Avatar,
  Badge,
  Section,
  Button,
  s,
  Notice,
} from "../../components/design/System";
import { artwork } from "../../theme/assets";
import { useAuth } from "../../context/AuthContext";
import { useChild } from "../../context/ChildContext";
import {
  getChildAttendance,
  getChildReports,
  getDailyReport,
  getDaycareEvents,
  getDirectMessages,
  getAnnouncements,
  AttendanceRecord,
  DailyReportSummary,
  DetailedDailyReport,
  CalendarEvent,
  DirectMessage,
  DaycareAnnouncement,
} from "../../api/parentApi";

export function HomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const { selectedChild, childrenList, setSelectedChild } = useChild();

  const childId = selectedChild?.id || 1;
  const childFirstName = selectedChild?.full_name ? selectedChild.full_name.split(" ")[0] : "Your Child";
  const groupName = selectedChild?.group_name || "Daycare Group";

  // Calculate age string
  const formatAge = (dob?: string) => {
    if (!dob) return "";
    const birth = new Date(dob);
    const today = new Date();
    const years = today.getFullYear() - birth.getFullYear();
    return years > 0 ? `${years} years` : "Infant";
  };

  // State from real database queries
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [latestAttendance, setLatestAttendance] = useState<AttendanceRecord | null>(null);
  const [todayReport, setTodayReport] = useState<DetailedDailyReport | null>(null);
  const [upcomingEvent, setUpcomingEvent] = useState<CalendarEvent | null>(null);
  const [latestMessage, setLatestMessage] = useState<DirectMessage | null>(null);
  const [latestAnnouncement, setLatestAnnouncement] = useState<DaycareAnnouncement | null>(null);

  const formatEventTime = (isoString?: string) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  const loadDashboardData = useCallback(async () => {
    try {
      // 1. Fetch child attendance
      const attendanceList = await getChildAttendance(childId).catch(() => []);
      if (attendanceList.length > 0) {
        setLatestAttendance(attendanceList[0]);
      } else {
        setLatestAttendance(null);
      }

      // 2. Fetch child daily reports
      const reports = await getChildReports(childId).catch(() => []);
      if (reports.length > 0) {
        const latestSummary = reports[0];
        const detailed = await getDailyReport(latestSummary.id).catch(() => null);
        setTodayReport(detailed);
      } else {
        setTodayReport(null);
      }

      // 3. Fetch upcoming events
      const events = await getDaycareEvents(false).catch(() => []);
      if (events.length > 0) {
        setUpcomingEvent(events[0]);
      } else {
        setUpcomingEvent(null);
      }

      // 4. Fetch latest caregiver message
      const messages = await getDirectMessages().catch(() => []);
      if (messages.length > 0) {
        setLatestMessage(messages[0]);
      } else {
        setLatestMessage(null);
      }

      // 5. Fetch center announcements
      const annList = await getAnnouncements().catch(() => []);
      if (annList.length > 0) {
        setLatestAnnouncement(annList[0]);
      } else {
        setLatestAnnouncement(null);
      }
    } catch {
      // Silently handle network drops during background sync
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [childId]);

  useEffect(() => {
    setLoading(true);
    loadDashboardData();
    const unsubscribe = navigation.addListener?.("focus", () => {
      loadDashboardData();
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [navigation, loadDashboardData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  const report = () =>
    navigation.navigate("FullDailyReport", {
      reportId: todayReport?.id,
      childId: selectedChild?.id,
    });

  const actions = [
    {
      label: "Message",
      Icon: ChatCircle,
      bg: "#F0F4F3",
      run: () => navigation.navigate("MainTabs", { screen: "Messages" }),
    },
    { label: "Report", Icon: FileText, bg: "#FFF0C7", run: report },
    {
      label: "Health",
      Icon: Heart,
      bg: "#FFEAEA",
      run: () => navigation.navigate("HealthNotices"),
    },
    {
      label: "Ask AI",
      Icon: Robot,
      bg: "#EBE8F6",
      run: () => navigation.navigate("AIGuide"),
    },
    {
      label: "Calendar",
      Icon: CalendarBlank,
      bg: "#FDEBD5",
      run: () => navigation.navigate("CalendarPage"),
    },
  ];

  // Dynamic Highlights built from database records
  const highlights = [];
  if (todayReport) {
    if (todayReport.meals && todayReport.meals.length > 0) {
      const m = todayReport.meals[0];
      highlights.push({
        title: `${m.meal_type ? m.meal_type.charAt(0).toUpperCase() + m.meal_type.slice(1) : "Meal"}: ${m.portion || "completed"}`,
        label: "MEALS",
        Icon: ForkKnife,
        bg: "#FFF7CF",
        ink: "#DD7B13",
      });
    }
    if (todayReport.sleep_duration_min) {
      const h = Math.floor(todayReport.sleep_duration_min / 60);
      const min = todayReport.sleep_duration_min % 60;
      highlights.push({
        title: `Nap: ${h > 0 ? `${h}h ` : ""}${min}m`,
        label: "SLEEP",
        Icon: Moon,
        bg: "#F1EDF6",
        ink: "#6745AF",
      });
    }
    if (todayReport.activities && todayReport.activities.length > 0) {
      const a = todayReport.activities[0];
      highlights.push({
        title: a.description || "Activity completed",
        label: (a.activity_type || "LEARNING").toUpperCase(),
        Icon: PuzzlePiece,
        bg: "#E8F6F3",
        ink: "#008794",
      });
    }
    if (todayReport.activities && todayReport.activities.length > 1) {
      const a2 = todayReport.activities[1];
      highlights.push({
        title: a2.description || "Play session",
        label: "PLAY",
        Icon: Car,
        bg: "#F0F6E8",
        ink: "#3B813C",
      });
    }
    if (todayReport.mood) {
      highlights.push({
        title: todayReport.mood.charAt(0).toUpperCase() + todayReport.mood.slice(1),
        label: "MOOD",
        Icon: Smiley,
        bg: "#FFF0E9",
        ink: "#CC423E",
      });
    }
    if (todayReport.general_observations) {
      highlights.push({
        title: todayReport.general_observations.slice(0, 32) + (todayReport.general_observations.length > 32 ? "…" : ""),
        label: "OBSERVATION",
        Icon: Eye,
        bg: "#FDEDED",
        ink: "#BD4264",
      });
    }
  }

  // Attendance badge determination
  let attendanceBadgeText = "● NOT CHECKED IN";
  let attendanceSubText = "No check-in record for today yet";
  if (latestAttendance) {
    if (latestAttendance.event_type === "checkin") {
      attendanceBadgeText = "● AT DAYCARE";
      attendanceSubText = `Checked in at ${formatEventTime(latestAttendance.event_time)}`;
    } else if (latestAttendance.event_type === "checkout") {
      attendanceBadgeText = "● CHECKED OUT";
      attendanceSubText = `Picked up at ${formatEventTime(latestAttendance.event_time)}`;
    } else if (latestAttendance.event_type === "absent") {
      attendanceBadgeText = "● ABSENT";
      attendanceSubText = `Marked absent on ${new Date(latestAttendance.event_time).toLocaleDateString()}`;
    }
  }

  return (
    <Page contentStyle={{ paddingHorizontal: 28 }}>
      <Text size={16}>
        Good morning, {user?.name?.split(" ")[0] || "Parent"}
      </Text>
      <Text
        color="#6F727A"
        size={16}
        style={{ marginTop: 7, marginBottom: 24 }}
      >
        Here’s how {childFirstName}’s day is going.
      </Text>

      {/* Multi-Child Switcher for families with multiple enrolled children */}
      {childrenList && childrenList.length > 1 && (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {childrenList.map((c) => {
            const isSelected = c.id === selectedChild?.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setSelectedChild(c)}
                style={{
                  paddingVertical: 7,
                  paddingHorizontal: 14,
                  borderRadius: 20,
                  backgroundColor: isSelected ? "#061224" : "#EDEAE3",
                  borderWidth: 1,
                  borderColor: isSelected ? "#061224" : "#DCD7CC",
                }}
              >
                <Text
                  size={12}
                  weight={isSelected ? "bold" : "medium"}
                  color={isSelected ? "#FFFFFF" : "#444B54"}
                >
                  {c.full_name.split(" ")[0]} ({c.group_name || "Daycare"})
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Child Status Hero Card */}
      <Card
        onPress={() =>
          navigation.navigate("ChildProfile", { childId: selectedChild?.id })
        }
        style={{ padding: 18, overflow: "hidden" }}
      >
        <CardGlow />
        <View style={s.row}>
          <Avatar source={artwork.child} size={66} />
          <View style={{ flex: 1 }}>
            <View style={s.between}>
              <Text size={18} weight="medium">
                {selectedChild?.full_name || childFirstName}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View Attendance History"
                onPress={() => navigation.navigate("AttendanceHistory")}
              >
                <Badge title={attendanceBadgeText} />
              </Pressable>
            </View>
            <Text size={13} color="#6A6F78" style={{ marginTop: 5 }}>
              {[formatAge(selectedChild?.dob), groupName].filter(Boolean).join(" · ")}
            </Text>
            <Text size={13} color="#7E828A" style={{ marginTop: 7 }}>
              {attendanceSubText}
            </Text>
          </View>
        </View>
      </Card>

      {/* Latest Center Announcement Banner */}
      {latestAnnouncement && (
        <Card
          tint="#FFFBEA"
          style={{
            borderColor: "#F6E4AC",
            borderWidth: 1.5,
            marginTop: 18,
            padding: 16,
            borderRadius: 20,
          }}
          onPress={() => navigation.navigate("MainTabs", { screen: "Messages" })}
        >
          <View style={[s.row, { marginBottom: 6 }]}>
            <SpeakerHigh size={18} color="#9C6B10" weight="fill" />
            <Text size={11} color="#855B09" weight="bold" style={{ letterSpacing: 0.8, marginLeft: 6 }}>
              DAYCARE ANNOUNCEMENT
            </Text>
          </View>
          <Text size={16} weight="bold" color="#10263D">
            {latestAnnouncement.title}
          </Text>
          <Text size={13} color="#454D57" numberOfLines={2} style={{ marginTop: 4, lineHeight: 18 }}>
            {latestAnnouncement.body}
          </Text>
          <View style={[s.between, { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderColor: "#EFE0BF" }]}>
            <Text size={11} color="#855B09">
              Posted by {latestAnnouncement.author_name || "Center Administration"}
            </Text>
            <Text size={11} color="#855B09" weight="bold">
              View announcement feed →
            </Text>
          </View>
        </Card>
      )}

      {/* Quick Actions */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 24,
        }}
      >
        {actions.map((a) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            onPress={a.run}
            style={{ alignItems: "center", gap: 8 }}
          >
            <View
              style={{
                width: 57,
                height: 57,
                borderRadius: 20,
                backgroundColor: a.bg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <a.Icon size={24} color="#132739" weight="fill" />
            </View>
            <Text size={11} color="#555E69">
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Highlights Section */}
      <Section title="Today’s Highlights" action="View All" onPress={report} />

      {loading ? (
        <Card style={{ alignItems: "center", paddingVertical: 32 }}>
          <ActivityIndicator color="#061224" />
          <Text size={13} color="#7E828A" style={{ marginTop: 10 }}>Loading today's updates…</Text>
        </Card>
      ) : highlights.length > 0 ? (
        <View style={s.grid}>
          {highlights.map((h, idx) => (
            <Pressable
              key={idx}
              accessibilityRole="button"
              accessibilityLabel={h.label + ": " + h.title}
              onPress={report}
              style={{
                width: "48%",
                minHeight: 132,
                padding: 16,
                borderRadius: 23,
                backgroundColor: h.bg,
                overflow: "hidden",
                marginBottom: 12,
              }}
            >
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  right: -16,
                  bottom: -12,
                  opacity: 0.06,
                }}
              >
                <h.Icon size={83} color={h.ink} weight="fill" />
              </View>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: h.bg,
                  marginBottom: 8,
                  justifyContent: "center",
                }}
              >
                <h.Icon size={25} color={h.ink} weight="fill" />
              </View>
              <Text size={10} color={h.ink} style={{ marginBottom: 5 }}>
                {h.label}
              </Text>
              <Text size={14} weight="medium" color={h.ink}>
                {h.title}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Card style={{ padding: 18, marginBottom: 12 }}>
          <View style={s.row}>
            <Clock size={20} color="#858990" />
            <Text size={14} weight="medium" style={{ marginLeft: 8 }}>
              No report submitted yet today
            </Text>
          </View>
          <Text size={13} color="#747984" style={{ marginTop: 6, lineHeight: 18 }}>
            Caregivers submit meals, naps, and activity reports during the afternoon. Check back shortly.
          </Text>
        </Card>
      )}

      {/* Latest Activity Card */}
      {todayReport?.activities && todayReport.activities.length > 0 && (
        <Card
          style={{ marginTop: 12, padding: 0, overflow: "hidden" }}
          onPress={report}
        >
          <View
            style={[
              s.between,
              {
                paddingHorizontal: 18,
                paddingVertical: 12,
                backgroundColor: "#FFF6DA",
              },
            ]}
          >
            <View style={s.row}>
              <Palette size={18} color="#D78B23" />
              <Text size={11} color="#C78020" style={{ letterSpacing: 0.8 }}>
                LATEST ACTIVITY
              </Text>
            </View>
            <Text size={11} color="#C78020">
              {todayReport.report_date}
            </Text>
          </View>
          <View style={[s.row, { padding: 16, alignItems: "flex-start" }]}>
            <Image
              source={artwork.painting}
              style={{ width: 98, height: 104, borderRadius: 14 }}
            />
            <View style={{ flex: 1 }}>
              <Text size={18} weight="medium">
                {todayReport.activities[0].description || "Daily Activity"}
              </Text>
              <Text
                size={14}
                color="#707782"
                style={{ marginTop: 4 }}
                numberOfLines={3}
              >
                Location: {todayReport.activities[0].location || "Daycare Room"}
              </Text>
            </View>
          </View>
        </Card>
      )}

      {/* Caregiver Observation / Message */}
      {(todayReport?.general_observations || latestMessage) && (
        <Card tint="#F4F5ED" style={{ marginTop: 24, overflow: "hidden" }}>
          <CardGlow color="#C9DEEF" />
          <View style={s.row}>
            <Avatar source={artwork.caregiver} size={42} />
            <View>
              <Text weight="medium">
                {todayReport?.caregiver_name || latestMessage?.sender_name || "Daycare Staff"}
              </Text>
              <Text size={11} color="#858990">
                Caregiver Note
              </Text>
            </View>
          </View>
          <Text color="#606B74" style={{ marginTop: 16, marginBottom: 20 }}>
            “{todayReport?.general_observations || latestMessage?.body}”
          </Text>
          <Button
            title="Message Caregiver"
            icon={ArrowBendUpLeft}
            variant="outline"
            style={{ backgroundColor: "#fff" }}
            onPress={() => navigation.navigate("MainTabs", { screen: "Messages" })}
          />
        </Card>
      )}

      {/* Upcoming Event Card from Database */}
      {upcomingEvent && (
        <Card
          style={{ marginTop: 24, borderColor: "#E3E5F5" }}
          onPress={() => navigation.navigate("EventDetail", { eventId: upcomingEvent.id })}
        >
          <View style={s.row}>
            <View
              style={{
                padding: 12,
                borderRadius: 14,
                backgroundColor: "#EDEBF7",
                alignItems: "center",
                minWidth: 54,
              }}
            >
              <Text size={10} color="#6566A0" weight="bold">
                {new Date(upcomingEvent.event_date).toLocaleString("en-US", { month: "short" }).toUpperCase()}
              </Text>
              <Text size={20} color="#6566A0" weight="bold">
                {new Date(upcomingEvent.event_date).getDate()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text size={16} weight="medium">
                {upcomingEvent.title}
              </Text>
              <Text size={13} color="#747984">
                {upcomingEvent.event_time ? upcomingEvent.event_time : "All day"}
              </Text>
            </View>
            <ArrowRight size={24} color="#6566A0" />
          </View>
        </Card>
      )}
    </Page>
  );
}
