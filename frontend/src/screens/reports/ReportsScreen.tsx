import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Pressable, ActivityIndicator } from "react-native";
import { ArrowRight } from "phosphor-react-native/src/icons/ArrowRight";
import { Clock } from "phosphor-react-native/src/icons/Clock";
import { Info } from "phosphor-react-native/src/icons/Info";
import { CalendarBlank } from "phosphor-react-native/src/icons/CalendarBlank";
import { Heart } from "phosphor-react-native/src/icons/Heart";
import {
  Page,
  Text,
  Card,
  Avatar,
  Badge,
  Button,
  s,
  Notice,
} from "../../components/design/System";
import { artwork } from "../../theme/assets";
import { useChild } from "../../context/ChildContext";
import { getChildReports, DailyReportSummary } from "../../api/parentApi";

export function ReportsScreen({ navigation }: any) {
  const { selectedChild } = useChild();
  const childId = selectedChild?.id;
  const childName = selectedChild?.full_name ? selectedChild.full_name.split(" ")[0] : "Your Child";
  const groupName = selectedChild?.group_name || "Daycare Group";

  const [filter, setFilter] = useState("This Month");
  const [reports, setReports] = useState<DailyReportSummary[]>([]);
  const [loadError,setLoadError]=useState("");
  const [loading, setLoading] = useState(true);

  const requestRevision = useRef(0);
  const loadReports = useCallback(async () => {
    const revision = ++requestRevision.current;
    if (!childId) { setReports([]); setLoading(false); return; }
    setLoading(true);
    try {
      setLoadError("");
      const data = await getChildReports(childId);
      if (revision === requestRevision.current) setReports(data);
    } catch {
      if (revision === requestRevision.current) setLoadError("Reports could not be loaded. Please retry.");
    } finally {
      if (revision === requestRevision.current) setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    setReports([]);
    loadReports();
    const unsubscribe = navigation.addListener?.("focus", () => {
      loadReports();
    });
    return () => {
      requestRevision.current++;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [navigation, loadReports]);

  // Filter reports
  const todayStr = new Date().toISOString().split("T")[0];
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const filtered = reports.filter((r) => {
    if (filter === "Today") {
      return r.report_date.slice(0, 10) === todayStr;
    }
    if (filter === "This Week") {
      return new Date(r.report_date) >= oneWeekAgo;
    }
    if (filter === "This Month") {
      return new Date(r.report_date) >= startOfMonth;
    }
    return true; // "All"
  });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <Page title="Reports">
      {!childId && <Notice>No child is linked to this account yet. Contact your daycare administrator.</Notice>}
      {!!loadError&&<><Notice>{loadError}</Notice><Button title="Retry" onPress={loadReports}/></>}
      <Card tint="#F1F0F5" style={{ padding: 16 }}>
        <View style={s.row}>
          <Avatar source={artwork.reportsChild} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text size={20} weight="semibold" numberOfLines={2}>
              {selectedChild?.full_name || childName}
            </Text>
            <Text size={13} color="#767C86">
              {groupName}
            </Text>
          </View>
        </View>
      </Card>

      {/* Quick Navigation into Related Child Care History Domains */}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate("AttendanceHistory")}
          style={{
            flex: 1,
            backgroundColor: "#FFFFFF",
            borderRadius: 14,
            padding: 12,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#E6ECF5",
            shadowColor: "#000",
            shadowOpacity: 0.03,
            shadowRadius: 4,
            elevation: 1,
          }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#EBF3FF", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
            <Clock size={20} color="#1E56A0" />
          </View>
          <Text size={12} weight="bold" color="#1E56A0">Attendance</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate("ReportsHistory")}
          style={{
            flex: 1,
            backgroundColor: "#FFFFFF",
            borderRadius: 14,
            padding: 12,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#E6ECF5",
            shadowColor: "#000",
            shadowOpacity: 0.03,
            shadowRadius: 4,
            elevation: 1,
          }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#FEF7E6", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
            <CalendarBlank size={20} color="#B45309" />
          </View>
          <Text size={12} weight="bold" color="#B45309">Archive</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate("HealthNotices")}
          style={{
            flex: 1,
            backgroundColor: "#FFFFFF",
            borderRadius: 14,
            padding: 12,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#E6ECF5",
            shadowColor: "#000",
            shadowOpacity: 0.03,
            shadowRadius: 4,
            elevation: 1,
          }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
            <Heart size={20} color="#B91C1C" />
          </View>
          <Text size={12} weight="bold" color="#B91C1C">Health</Text>
        </Pressable>
      </View>

      {/* Filter Tabs */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginVertical: 16, gap: 8 }}>
        {["Today", "This Week", "This Month", "All"].map((f) => (
          <Pressable
            key={f}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f }}
            aria-pressed={filter === f}
            onPress={() => setFilter(f)}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              minHeight: 44,
              justifyContent: "center",
              borderRadius: 22,
              backgroundColor: filter === f ? "#FFCA32" : "#EFEDF0",
            }}
          >
            <Text size={13} weight="medium">
              {f}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <Card style={{ alignItems: "center", paddingVertical: 40 }}>
          <ActivityIndicator color="#061224" />
        </Card>
      ) : filtered.length > 0 ? (
        filtered.map((r, i) => (
          <Card
            key={r.id}
            style={{
              marginBottom: 16,
              padding: 22,
              borderLeftWidth: 4,
              borderLeftColor: "#2D6A4F",
            }}
          >
            <View style={s.between}>
              <Text size={18} weight="semibold" style={{ flexShrink: 1 }}>{formatDate(r.report_date)}</Text>
            </View>

            <View style={[s.row, { flexWrap: "wrap", marginVertical: 12, gap: 6 }]}>
              {r.mood ? <Badge title={r.mood.charAt(0).toUpperCase() + r.mood.slice(1)} tone="neutral" /> : null}
              {r.sleep_duration_min ? (
                <Badge
                  title={`Nap ${r.sleep_duration_min}m`}
                  tone="neutral"
                />
              ) : null}
            </View>

            <Button
              title="View report"
              variant={i === 0 ? "primary" : "secondary"}
              icon={i === 0 ? ArrowRight : undefined}
              onPress={() =>
                navigation.navigate("FullDailyReport", { reportId: r.id })
              }
            />
          </Card>
        ))
      ) : (
        <Card style={{ padding: 24, alignItems: "center" }}>
          <CalendarBlank size={36} color="#8A909B" />
          <Text size={16} weight="semibold" style={{ marginTop: 12 }}>
            {filter === "All" ? "No reports yet" : `No reports ${filter.toLowerCase()}`}
          </Text>
        </Card>
      )}
    </Page>
  );
}
