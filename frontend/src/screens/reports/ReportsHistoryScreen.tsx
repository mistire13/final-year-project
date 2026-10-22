import React, { useState, useEffect, useCallback } from "react";
import { View, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { ArrowRight, Clock, CalendarBlank, ForkKnife, Moon, Smiley, ArrowClockwise } from "phosphor-react-native";
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
import { artwork } from "../../theme/assets";
import { useChild } from "../../context/ChildContext";
import { getChildReports, DailyReportSummary } from "../../api/parentApi";

export function ReportsHistoryScreen({ navigation, route }: any) {
  const { selectedChild } = useChild();
  const childId = route?.params?.childId || selectedChild?.id || 1;
  const childName = selectedChild?.full_name ? selectedChild.full_name.split(" ")[0] : "Your Child";
  const groupName = selectedChild?.group_name || "Daycare Classroom";

  const [reports, setReports] = useState<DailyReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState("All");

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getChildReports(childId);
      setReports(data || []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    loadReports();
    const unsubscribe = navigation.addListener?.("focus", loadReports);
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [navigation, loadReports]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  };

  // Month filters
  const months = ["All", "This Month", "Last Month"];
  const now = new Date();
  const thisMonthIdx = now.getMonth();
  const thisYear = now.getFullYear();

  const filtered = reports.filter((r) => {
    if (filterMonth === "All") return true;
    const rDate = new Date(r.report_date);
    if (filterMonth === "This Month") {
      return rDate.getMonth() === thisMonthIdx && rDate.getFullYear() === thisYear;
    }
    if (filterMonth === "Last Month") {
      const prevMonth = thisMonthIdx === 0 ? 11 : thisMonthIdx - 1;
      const prevYear = thisMonthIdx === 0 ? thisYear - 1 : thisYear;
      return rDate.getMonth() === prevMonth && rDate.getFullYear() === prevYear;
    }
    return true;
  });

  return (
    <Page
      title="Report Archive"
      subtitle={`Past daily activity logs and memories for ${childName}.`}
      back
      tabs
      activeTab="Reports"
    >
      {/* Child Summary Card */}
      <Card tint="#F1F0F5" style={{ padding: 16, marginBottom: 16 }}>
        <View style={s.row}>
          <Avatar source={artwork.reportsChild} size={54} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text size={19} weight="semibold">
              {selectedChild?.full_name || childName}
            </Text>
            <Text size={12} color="#767C86">
              {groupName} · Historical Records
            </Text>
          </View>
          <Badge title={`${reports.length} Total Logs`} tone="neutral" />
        </View>
      </Card>

      {/* Filter Tabs */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 18 }}>
        {months.map((m) => {
          const isSelected = filterMonth === m;
          return (
            <Pressable
              key={m}
              onPress={() => setFilterMonth(m)}
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
                {m}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <Card style={{ alignItems: "center", paddingVertical: 40 }}>
          <ActivityIndicator color="#061224" />
          <Text size={13} color="#858A93" style={{ marginTop: 12 }}>
            Loading archive…
          </Text>
        </Card>
      ) : filtered.length > 0 ? (
        filtered.map((item) => (
          <Card
            key={item.id}
            onPress={() =>
              navigation.navigate("FullDailyReport", {
                reportId: item.id,
                childId: selectedChild?.id,
              })
            }
            style={{ marginBottom: 12, padding: 16 }}
          >
            <View style={[s.between, { marginBottom: 8 }]}>
              <View style={s.row}>
                <CalendarBlank size={16} color="#7E8793" />
                <Text size={15} weight="semibold" style={{ marginLeft: 6 }}>
                  {formatDate(item.report_date)}
                </Text>
              </View>
              <Badge title={item.mood ? item.mood.toUpperCase() : "RECORDED"} tone="green" />
            </View>

            <View style={[s.row, { marginTop: 6, flexWrap: "wrap", gap: 14 }]}>
              {item.sleep_duration_min ? (
                <View style={s.row}>
                  <Moon size={14} color="#6745AF" />
                  <Text size={12} color="#6745AF" style={{ marginLeft: 4 }}>
                    Nap: {item.sleep_duration_min}m
                  </Text>
                </View>
              ) : null}

              {item.caregiver_name ? (
                <Text size={12} color="#7B828F">
                  By: {item.caregiver_name}
                </Text>
              ) : null}
            </View>

            <View style={[s.between, { marginTop: 12, borderTopWidth: 1, borderTopColor: "#EDEAE4", paddingTop: 8 }]}>
              <Text size={12} color="#7B828F">
                Tap to read full report & meals
              </Text>
              <ArrowRight size={18} color="#061224" />
            </View>
          </Card>
        ))
      ) : (
        <Card style={{ alignItems: "center", paddingVertical: 36, paddingHorizontal: 20 }}>
          <CalendarBlank size={32} color="#8A929E" style={{ marginBottom: 12 }} />
          <Text size={17} weight="semibold" style={{ textAlign: "center", marginBottom: 6 }}>
            No Archived Reports Found
          </Text>
          <Text size={13} color="#7B828F" style={{ textAlign: "center", lineHeight: 18 }}>
            No past reports match the selected timeframe. As daily reports are submitted by daycare staff, they are permanently archived here.
          </Text>
        </Card>
      )}
    </Page>
  );
}
