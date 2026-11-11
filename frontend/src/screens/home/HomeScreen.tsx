import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import { ChatCircle } from "phosphor-react-native/src/icons/ChatCircle";
import { FileText } from "phosphor-react-native/src/icons/FileText";
import { Robot } from "phosphor-react-native/src/icons/Robot";
import { CalendarBlank } from "phosphor-react-native/src/icons/CalendarBlank";
import { ForkKnife } from "phosphor-react-native/src/icons/ForkKnife";
import { Moon } from "phosphor-react-native/src/icons/Moon";
import { PuzzlePiece } from "phosphor-react-native/src/icons/PuzzlePiece";
import { Car } from "phosphor-react-native/src/icons/Car";
import { Smiley } from "phosphor-react-native/src/icons/Smiley";
import { Eye } from "phosphor-react-native/src/icons/Eye";
import { ArrowRight } from "phosphor-react-native/src/icons/ArrowRight";
import { Clock } from "phosphor-react-native/src/icons/Clock";
import { Heart } from "phosphor-react-native/src/icons/Heart";
import { SpeakerHigh } from "phosphor-react-native/src/icons/SpeakerHigh";
import { X } from "phosphor-react-native/src/icons/X";
import { CreditCard } from "phosphor-react-native/src/icons/CreditCard";
import { MotionPressable } from "../../components/design/Motion";
import { colors, radii } from "../../theme/tokens";
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
  IconButton,
} from "../../components/design/System";
import { apiClient } from "../../api/client";
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
  const { width, fontScale } = useWindowDimensions();
  const compactShortcuts = width < 460 || fontScale > 1.2;

  const childId = selectedChild?.id;
  const childFirstName = selectedChild?.full_name ? selectedChild.full_name.split(" ")[0] : "Your Child";
  const groupName = selectedChild?.group_name;

  // Calculate age string
  const formatAge = (dob?: string) => {
    if (!dob) return "";
    const birth = new Date(dob);
    const today = new Date();
    let years = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) years--;
    return years > 0 ? `${years} years` : "Infant";
  };

  // State from real database queries
  const [loadError,setLoadError]=useState("");
  const [loading, setLoading] = useState(true);
  const [latestAttendance, setLatestAttendance] = useState<AttendanceRecord | null>(null);
  const [todayReport, setTodayReport] = useState<DetailedDailyReport | null>(null);
  const [upcomingEvent, setUpcomingEvent] = useState<CalendarEvent | null>(null);
  const [latestMessage, setLatestMessage] = useState<DirectMessage | null>(null);
  const [latestAnnouncement, setLatestAnnouncement] = useState<DaycareAnnouncement | null>(null);
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<number[]>([]);

  const formatEventTime = (isoString?: string) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  const requestRevision = useRef(0);
  const loadDashboardData = useCallback(async () => {
    const revision = ++requestRevision.current;
    setLoadError("");
    try {
      const promises: [
        Promise<AttendanceRecord[]>,
        Promise<DailyReportSummary[]>,
        Promise<CalendarEvent[]>,
        Promise<DirectMessage[]>,
        Promise<DaycareAnnouncement[]>
      ] = [
        childId ? getChildAttendance(childId) : Promise.resolve([]),
        childId ? getChildReports(childId) : Promise.resolve([]),
        getDaycareEvents(false).catch(() => []),
        getDirectMessages().catch(() => []),
        getAnnouncements().catch(() => [])
      ];
      const [attendance, reports, events, messages, announcements] = await Promise.all(promises);
      const localDay = (value: string | Date) => new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Addis_Ababa',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
      const todayKey = localDay(new Date());
      const currentReport = reports.find(report => localDay(report.report_date) === todayKey);
      const detailed = currentReport ? await getDailyReport(currentReport.id).catch(() => null) : null;
      if (revision !== requestRevision.current) return;
      setLatestAttendance(attendance.find(record => localDay(record.event_time) === todayKey) || null);
      setTodayReport(detailed);
      setUpcomingEvent(events[0] || null);
      const incomingStaffMessage = messages.find((m) => m.sender_id !== user?.id) || null;
      setLatestMessage(incomingStaffMessage);
      const activeAnn = announcements.find(a => !dismissedAnnouncements.includes(a.id)) || announcements[0] || null;
      setLatestAnnouncement(activeAnn);
    } catch {
      if (revision === requestRevision.current) setLoadError("Could not load updates.");
    } finally {
      if (revision === requestRevision.current) setLoading(false);
    }
  }, [childId, user?.id, dismissedAnnouncements]);

  const dismissAnnouncement = useCallback((id: number) => {
    setDismissedAnnouncements(prev => [...prev, id]);
    apiClient.patch('/notifications/preferences', { read_announcement_id: id }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setLatestAttendance(null); setTodayReport(null); setUpcomingEvent(null); setLatestMessage(null); setLatestAnnouncement(null);
    loadDashboardData();
    const unsubscribe = navigation.addListener?.("focus", () => {
      loadDashboardData();
    });
    return () => {
      requestRevision.current++;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [navigation, loadDashboardData]);

  if (!childId) return <Page title={`Welcome, ${user?.name?.split(" ")[0] || "parent"}`}>
    <Notice>No child is linked to this account yet. Contact your daycare administrator to complete enrollment.</Notice>
    <Button title="Message daycare" onPress={()=>navigation.navigate("MainTabs",{screen:"Messages"})}/>
    <Button title="Daycare calendar" variant="outline" onPress={()=>navigation.navigate("CalendarPage")} style={{marginTop:12}}/>
  </Page>;

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
    {
      label: "Fees",
      Icon: CreditCard,
      bg: "#E8F0FE",
      run: () => navigation.navigate("ChildCareFees"),
    },
  ];

  // Dynamic Highlights built from database records
  const highlights = [];
  if (todayReport) {
    if (todayReport.meals && todayReport.meals.length > 0) {
      const m = todayReport.meals[0];
      highlights.push({
        title: `${m.meal_type ? m.meal_type.charAt(0).toUpperCase() + m.meal_type.slice(1) : "Meal"}: ${m.portion || "recorded"}`,
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
        title: a.description || "Activity recorded",
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
        title: todayReport.general_observations,
        label: "OBSERVATION",
        Icon: Eye,
        bg: "#FDEDED",
        ink: "#BD4264",
      });
    }
  }

  // Attendance badge determination
  let attendanceBadgeText = "Not checked in";
  let attendanceSubText = "";
  let attendanceTone: "green" | "gold" | "red" | "neutral" = "neutral";
  if (latestAttendance) {
    if (latestAttendance.event_type === "checkin") {
      attendanceBadgeText = "At daycare";
      attendanceTone = "green";
      attendanceSubText = `Checked in at ${formatEventTime(latestAttendance.event_time)}`;
    } else if (latestAttendance.event_type === "checkout") {
      attendanceBadgeText = "Checked out";
      attendanceSubText = `Picked up at ${formatEventTime(latestAttendance.event_time)}`;
    } else if (latestAttendance.event_type === "absent") {
      attendanceBadgeText = "Absent";
      attendanceTone = "red";
    }
  }
  if (loading) {
    attendanceBadgeText = "Checking attendance…";
  } else if (loadError) {
    attendanceBadgeText = "Attendance unavailable";
  }

  return (
    <Page>
      <Text size={28} weight="bold" style={{ marginBottom: 16 }}>
        Hello, {user?.name?.split(" ")[0] || "Parent"}
      </Text>

      {/* Latest Center Announcement Notification Card */}
      {latestAnnouncement && !dismissedAnnouncements.includes(latestAnnouncement.id) && (
        <Card
          tint={colors.pastelYellow}
          style={{
            borderWidth: 1,
            borderColor: `${colors.pastelYellowText}66`,
            marginBottom: 16,
            padding: 6,
            borderRadius: radii.card,
            shadowOpacity: 0.025,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 3 },
            elevation: 1,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <MotionPressable
              accessibilityRole="button"
              accessibilityLabel={`Open announcement: ${latestAnnouncement.title}`}
              accessibilityHint="Opens the full announcement"
              onPress={() => navigation.navigate("AnnouncementDetail", { announcementId: latestAnnouncement.id })}
              style={{ flex: 1, minWidth: 0, minHeight: 56, flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: radii.subcard }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bgSurface, alignItems: "center", justifyContent: "center" }}>
                <SpeakerHigh size={18} color={colors.textPrimary} weight="regular" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text size={11} weight="medium" color={colors.textSecondary} style={{ marginBottom: 3 }}>
                  {latestAnnouncement.announcement_type === "alert" ? "Important notice" : latestAnnouncement.announcement_type === "meal_plan" ? "Meal plan" : "Announcement"}
                </Text>
                <Text size={14} weight="semibold" color={colors.textPrimary} numberOfLines={2} ellipsizeMode="tail" style={{ lineHeight: 20 }}>
                  {latestAnnouncement.title}
                </Text>
              </View>
            </MotionPressable>
            <IconButton icon={X} size={16} color={colors.textSecondary} label="Dismiss announcement" onPress={() => dismissAnnouncement(latestAnnouncement.id)} />
          </View>
        </Card>
      )}

      {/* Multi-Child Switcher for families with multiple enrolled children */}
      {childrenList && childrenList.length > 1 && (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {childrenList.map((c) => {
            const isSelected = c.id === selectedChild?.id;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={`Select ${c.full_name}`}
                accessibilityState={{selected:isSelected}}
                onPress={() => setSelectedChild(c)}
                style={{
                  paddingVertical: 7,
                  paddingHorizontal: 14,
                  maxWidth: "100%",
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
                  {c.full_name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Child Status Hero Card */}
      <Card
        style={{ padding: 18, overflow: "hidden" }}
      >
        <CardGlow />
        <MotionPressable
          accessibilityRole="button"
          accessibilityLabel={`View child profile: ${selectedChild?.full_name || childFirstName}`}
          onPress={() => navigation.navigate("ChildProfile", { childId })}
          style={[s.row, { minHeight: 48 }]}
        >
          <Avatar source={selectedChild?.photo_url ? {uri:selectedChild.photo_url} : undefined} initials={(selectedChild?.full_name||'Child').split(' ').map(n=>n[0]).join('').slice(0,2)} size={48} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text size={18} weight="semibold" numberOfLines={2}>
              {selectedChild?.full_name || childFirstName}
            </Text>
            <Text size={13} color={colors.textSecondary} numberOfLines={2}>
              {[formatAge(selectedChild?.dob), groupName].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <ArrowRight size={18} color={colors.textSecondary} />
        </MotionPressable>
        <MotionPressable
          accessibilityRole="button"
          accessibilityLabel={[attendanceBadgeText, attendanceSubText, "View attendance history"].filter(Boolean).join(". ")}
          onPress={() => navigation.navigate("AttendanceHistory")}
          style={[s.row, { flexWrap: "wrap", minHeight: 44, marginTop: 8, rowGap: 4 }]}
        >
          <Badge title={attendanceBadgeText} tone={attendanceTone} />
          {!!attendanceSubText && <Text size={13} color={colors.textSecondary}>{attendanceSubText}</Text>}
        </MotionPressable>
      </Card>

      {!!loadError && (
        <>
          <Notice tone="error">{loadError}</Notice>
          <Button title="Retry" variant="outline" onPress={loadDashboardData} />
        </>
      )}

      {/* Quick Actions */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          rowGap: 12,
          marginTop: 16,
        }}
      >
        {actions.map((a) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            onPress={a.run}
            style={{ alignItems: "center", gap: 4, width: compactShortcuts ? "32%" : "16%", minWidth: 0 }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 15,
                backgroundColor: a.bg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <a.Icon size={22} color="#132739" weight="fill" />
            </View>
            <Text size={12} color={colors.textSecondary} style={{ textAlign: "center" }}>
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
              <Text size={10} color={h.ink} numberOfLines={2} style={{ marginBottom: 5 }}>
                {h.label}
              </Text>
              <Text size={14} weight="medium" color={h.ink} numberOfLines={3}>
                {h.title}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Card style={{ padding: 18, marginBottom: 12 }}>
          <View style={s.row}>
            <Clock size={20} color="#858990" />
            <Text size={14} weight="medium" style={{ flexShrink: 1 }}>
              No report yet today
            </Text>
          </View>
        </Card>
      )}

      {latestMessage && (
        <Card
          style={{ marginTop: 16, padding: 16 }}
          onPress={() => navigation.navigate("CaregiverChat", {
            recipientId: latestMessage.sender_id,
            recipientName: latestMessage.sender_name,
            recipientRole: latestMessage.sender_role,
          })}
        >
          <View style={s.row}>
            <ChatCircle size={22} color={colors.textSecondary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text weight="semibold" numberOfLines={2}>
                {latestMessage.sender_name || "Daycare message"}
              </Text>
              <Text size={13} color={colors.textSecondary} numberOfLines={2}>
                {latestMessage.body}
              </Text>
            </View>
            <ArrowRight size={18} color={colors.textSecondary} />
          </View>
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

      {/* Monthly Tuition & Care Fees Card */}
      <Card
        tint="#F7F9FC"
        style={{
          marginTop: 20,
          padding: 16,
          borderColor: colors.borderCard,
        }}
      >
        <View style={[s.between, { flexWrap: "wrap", gap: 12 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 190 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "#E8F0FE",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CreditCard size={22} color="#1E56A0" weight="fill" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text size={16} weight="bold" color={colors.textPrimary}>
                Care Fees & Tuition
              </Text>
              <Text size={13} color={colors.textSecondary} style={{ marginTop: 2 }}>
                Monthly tuition invoices & verified receipts
              </Text>
            </View>
          </View>
          <Button
            title="Invoices"
            variant="outline"
            onPress={() => navigation.navigate("ChildCareFees")}
            style={{ minHeight: 44, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: colors.bgSurface }}
          />
        </View>
      </Card>
    </Page>
  );
}
