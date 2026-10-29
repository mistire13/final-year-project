import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, Image, Pressable, RefreshControl, ActivityIndicator } from "react-native";
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
import { Palette } from "phosphor-react-native/src/icons/Palette";
import { ArrowRight } from "phosphor-react-native/src/icons/ArrowRight";
import { ArrowBendUpLeft } from "phosphor-react-native/src/icons/ArrowBendUpLeft";
import { Warning } from "phosphor-react-native/src/icons/Warning";
import { Clock } from "phosphor-react-native/src/icons/Clock";
import { Heart } from "phosphor-react-native/src/icons/Heart";
import { SpeakerHigh } from "phosphor-react-native/src/icons/SpeakerHigh";
import { X } from "phosphor-react-native/src/icons/X";
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

  const childId = selectedChild?.id;
  const childFirstName = selectedChild?.full_name ? selectedChild.full_name.split(" ")[0] : "Your Child";
  const groupName = selectedChild?.group_name || "Daycare Group";

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
  const [refreshing, setRefreshing] = useState(false);
  const [latestAttendance, setLatestAttendance] = useState<AttendanceRecord | null>(null);
  const [todayReport, setTodayReport] = useState<DetailedDailyReport | null>(null);
  const [upcomingEvent, setUpcomingEvent] = useState<CalendarEvent | null>(null);
  const [latestMessage, setLatestMessage] = useState<DirectMessage | null>(null);
  const [latestAnnouncement, setLatestAnnouncement] = useState<DaycareAnnouncement | null>(null);
  const [allAnnouncements, setAllAnnouncements] = useState<DaycareAnnouncement[]>([]);
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
      setAllAnnouncements(announcements);
      const activeAnn = announcements.find(a => !dismissedAnnouncements.includes(a.id)) || announcements[0] || null;
      setLatestAnnouncement(activeAnn);
    } catch {
      if (revision === requestRevision.current) setLoadError("Updates could not be loaded. Refresh to retry.");
    } finally {
      if (revision === requestRevision.current) { setLoading(false); setRefreshing(false); }
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

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

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
  if (loading) {
    attendanceBadgeText = '● LOADING ATTENDANCE';
    attendanceSubText = 'Checking today’s attendance record…';
  } else if (loadError) {
    attendanceBadgeText = '● ATTENDANCE UNAVAILABLE';
    attendanceSubText = 'Refresh to check today’s attendance.';
  }

  return (
    <Page contentStyle={{ paddingHorizontal: 28 }}>
      <Text size={16}>
        Hello, {user?.name?.split(" ")[0] || "Parent"}
      </Text>
      <Text
        color="#6F727A"
        size={16}
        style={{ marginTop: 7, marginBottom: 20 }}
      >
        Here’s how {childFirstName}’s day is going.
      </Text>

      {/* Latest Center Announcement Notification Card */}
      {latestAnnouncement && !dismissedAnnouncements.includes(latestAnnouncement.id) && (
        <Card
          tint="#FFFBEA"
          style={{
            borderColor: "#F6E4AC",
            borderWidth: 1.5,
            marginBottom: 20,
            padding: 16,
            borderRadius: 20,
            shadowColor: "#9C6B10",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 10,
          }}
          onPress={() => navigation.navigate("AnnouncementDetail", { announcementId: latestAnnouncement.id })}
        >
          <View style={[s.between, { marginBottom: 6 }]}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <SpeakerHigh size={18} color="#9C6B10" weight="fill" />
              <Text size={11} color="#855B09" weight="bold" style={{ letterSpacing: 0.8, marginLeft: 6 }}>
                DAYCARE ANNOUNCEMENT
              </Text>
              <View style={{ backgroundColor: "#BD4264", paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 10, marginLeft: 8 }}>
                <Text size={9} color="#fff" weight="bold">NEW</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss announcement"
              hitSlop={12}
              onPress={(e: any) => {
                e?.stopPropagation?.();
                dismissAnnouncement(latestAnnouncement.id);
              }}
              style={{ padding: 4 }}
            >
              <X size={16} color="#855B09" />
            </Pressable>
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
              Read announcement →
            </Text>
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
                  {c.full_name} ({c.group_name || "Daycare"})
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
        <View style={s.row}>
          <Avatar source={selectedChild?.photo_url ? {uri:selectedChild.photo_url} : undefined} initials={(selectedChild?.full_name||'Child').split(' ').map(n=>n[0]).join('').slice(0,2)} size={66} />
          <View style={{ flex: 1 }}>
            <View style={s.between}>
              <Text size={18} weight="medium">
                {selectedChild?.full_name || childFirstName}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View Attendance History"
                onPress={(e: any) => {
                  e?.stopPropagation?.();
                  navigation.navigate("AttendanceHistory");
                }}
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
        <Button title="View child profile" variant="outline" onPress={()=>navigation.navigate('ChildProfile',{childId:selectedChild?.id})} style={{marginTop:12}}/>
      </Card>

      {!childId && <Notice>No child is linked to this account yet. Contact your daycare administrator to complete enrollment.</Notice>}
      {!!loadError && <Notice>{loadError}</Notice>}

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
            No daily report has been saved for today. Contact your daycare if you need an update.
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
              {todayReport.activities[0].location ? (
                <Text
                  size={14}
                  color="#707782"
                  style={{ marginTop: 4 }}
                  numberOfLines={3}
                >
                  Location: {todayReport.activities[0].location}
                </Text>
              ) : null}
            </View>
          </View>
        </Card>
      )}

      {/* Caregiver Daily Observation or Daycare Staff Message */}
      {(todayReport?.general_observations || (latestMessage && latestMessage.sender_id !== user?.id)) && (() => {
        const hasCaregiverReport = !!todayReport?.general_observations;
        const isAdminMessage = !hasCaregiverReport && (latestMessage?.sender_role === "admin" || latestMessage?.sender_role === "super_admin");
        const authorName = hasCaregiverReport
          ? (todayReport?.caregiver_name || "Classroom Caregiver")
          : (latestMessage?.sender_name || (isAdminMessage ? "Daycare Administration" : "Classroom Educator"));
        const roleLabel = hasCaregiverReport
          ? "Classroom Caregiver Note"
          : isAdminMessage
            ? "Center Administration Notice"
            : "Caregiver Note";
        const noteText = hasCaregiverReport ? todayReport?.general_observations : latestMessage?.body;
        const buttonTitle = hasCaregiverReport
          ? "Message Caregiver"
          : isAdminMessage
            ? "Reply to Administration"
            : "Reply to Caregiver";

        return (
          <Card tint={isAdminMessage ? "#F0F4F8" : "#F4F5ED"} style={{ marginTop: 24, overflow: "hidden" }}>
            <CardGlow color={isAdminMessage ? "#D1E2F3" : "#C9DEEF"} />
            <View style={s.row}>
              <Avatar
                source={isAdminMessage ? undefined : artwork.caregiver}
                initials={isAdminMessage ? (authorName.slice(0, 2).toUpperCase()) : undefined}
                size={42}
              />
              <View style={{ flex: 1, marginLeft: isAdminMessage ? 10 : 0 }}>
                <Text weight="medium">
                  {authorName}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <View
                    style={{
                      backgroundColor: isAdminMessage ? "#DBEAFE" : "#E2E8F0",
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                      borderRadius: 4,
                    }}
                  >
                    <Text size={10} weight="semibold" color={isAdminMessage ? "#1E40AF" : "#475569"}>
                      {roleLabel}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
            <Text color="#606B74" style={{ marginTop: 16, marginBottom: 20 }}>
              “{noteText}”
            </Text>
            <Button
              title={buttonTitle}
              icon={ArrowBendUpLeft}
              variant="outline"
              style={{ backgroundColor: "#fff" }}
              onPress={() => {
                if (latestMessage && !hasCaregiverReport) {
                  navigation.navigate("CaregiverChat", {
                    recipientId: latestMessage.sender_id,
                    recipientName: latestMessage.sender_name,
                    recipientRole: latestMessage.sender_role,
                  });
                } else {
                  navigation.navigate("MainTabs", { screen: "Messages" });
                }
              }}
            />
          </Card>
        );
      })()}

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
