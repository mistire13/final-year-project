import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { ArrowRight } from "phosphor-react-native/src/icons/ArrowRight";
import { Clock } from "phosphor-react-native/src/icons/Clock";
import { Info } from "phosphor-react-native/src/icons/Info";
import { CalendarBlank } from "phosphor-react-native/src/icons/CalendarBlank";
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
    <Page title="Reports" subtitle={`A look back at ${childName}’s daycare days.`}>
      {!childId && <Notice>No child is linked to this account yet. Contact your daycare administrator.</Notice>}
      {!!loadError&&<><Notice>{loadError}</Notice><Button title="Retry" onPress={loadReports}/></>}
      <Card tint="#F1F0F5" style={{ padding: 16 }}>
        <View style={s.row}>
          <Avatar source={artwork.reportsChild} />
          <View>
            <Text size={23} weight="semibold">
              {selectedChild?.full_name || childName}
            </Text>
            <Text size={13} color="#767C86">
              {groupName}
            </Text>
          </View>
        </View>
      </Card>

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginVertical: 24, flexGrow: 0 }}
        contentContainerStyle={{ gap: 10 }}
      >
        {["Today", "This Week", "This Month", "All"].map((f) => (
          <Pressable
            key={f}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f }}
            aria-pressed={filter === f}
            onPress={() => setFilter(f)}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 22,
              backgroundColor: filter === f ? "#FFCA32" : "#EFEDF0",
            }}
          >
            <Text size={13} weight="medium">
              {f}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <Card style={{ alignItems: "center", paddingVertical: 40 }}>
          <ActivityIndicator color="#061224" />
          <Text size={13} color="#7E828A" style={{ marginTop: 10 }}>Loading daily reports…</Text>
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
              <Text size={19}>{formatDate(r.report_date)}</Text>
              <Badge
                title="● Recorded"
                tone="green"
              />
            </View>

            <View style={[s.row, { marginVertical: 16, gap: 8 }]}>
              {r.mood ? <Badge title={r.mood.charAt(0).toUpperCase() + r.mood.slice(1)} tone="neutral" /> : null}
              {r.sleep_duration_min ? (
                <Badge
                  title={`◷ Nap ${r.sleep_duration_min}m`}
                  tone="neutral"
                />
              ) : null}
              {r.caregiver_name ? (
                <Badge
                  title={`By ${r.caregiver_name}`}
                  tone="neutral"
                />
              ) : null}
            </View>

            <Button
              title="View Full Report"
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
            No reports for {filter.toLowerCase()}
          </Text>
          <Text size={13} color="#7E828A" style={{ textAlign: "center", marginTop: 6, lineHeight: 18 }}>
            Daily activity reports will be posted here as caregivers log attendance, meals, and naps.
          </Text>
        </Card>
      )}
    </Page>
  );
}
