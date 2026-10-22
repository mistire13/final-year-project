import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, Pressable } from "react-native";
import {
  SignIn,
  SignOut,
  ForkKnife,
  Moon,
  Palette,
  PuzzlePiece,
  Tree,
  Smiley,
  ChatCircle,
  ArrowClockwise,
  Heart,
  CheckCircle,
} from "phosphor-react-native";
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
import { artwork } from "../../theme/assets";
import { useChild } from "../../context/ChildContext";
import { getDailyReport, getChildReports, DetailedDailyReport } from "../../api/parentApi";

export function FullDailyReportScreen({ navigation, route }: any) {
  const { selectedChild } = useChild();
  const targetReportId = route.params?.reportId;
  const childId = route.params?.childId || selectedChild?.id || 1;

  const [report, setReport] = useState<DetailedDailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [emptyState, setEmptyState] = useState(false);

  const loadReport = async () => {
    setLoading(true);
    setError("");
    setEmptyState(false);
    try {
      // 1. Try target report ID if passed
      if (targetReportId) {
        try {
          const data = await getDailyReport(targetReportId);
          if (data && data.id) {
            setReport(data);
            return;
          }
        } catch {
          // If specified ID failed, fallback to searching for child's reports
        }
      }

      // 2. Fetch reports list for this child
      const summaries = await getChildReports(childId);
      if (summaries && summaries.length > 0) {
        const latest = await getDailyReport(summaries[0].id);
        if (latest && latest.id) {
          setReport(latest);
          return;
        }
      }

      // No reports exist for this child yet
      setReport(null);
      setEmptyState(true);
    } catch (e: any) {
      setError(e?.response?.data?.error || "This daily report could not be loaded from the database.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [targetReportId, childId]);

  const childName = selectedChild?.full_name || "Child";
  const groupName = selectedChild?.group_name || "Daycare Group";

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  };

  if (loading) {
    return (
      <Page title="Daily Report" back tabs activeTab="Reports">
        <Card style={{ alignItems: "center", paddingVertical: 40 }}>
          <ActivityIndicator color="#061224" />
          <Text size={14} color="#858A93" style={{ marginTop: 12 }}>Loading report details…</Text>
        </Card>
      </Page>
    );
  }

  if (emptyState || (!loading && !report && !error)) {
    return (
      <Page title="Daily Report" back tabs activeTab="Reports">
        <Card style={{ alignItems: "center", paddingVertical: 36, paddingHorizontal: 20 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#FFF7CF", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <ForkKnife size={30} color="#DD7B13" />
          </View>
          <Text size={18} weight="semibold" style={{ textAlign: "center", marginBottom: 8 }}>
            No Daily Report Yet Today
          </Text>
          <Text size={14} color="#7B818D" style={{ textAlign: "center", lineHeight: 20, marginBottom: 20 }}>
            Caregivers record meal times, nap duration, play, and learning activities throughout the day. Check back in the afternoon or view past reports.
          </Text>
          <View style={{ width: "100%", gap: 10 }}>
            <Button
              title="View Report History"
              onPress={() => navigation.navigate("Reports")}
            />
            <Button
              title="Refresh"
              icon={ArrowClockwise}
              variant="secondary"
              onPress={loadReport}
            />
          </View>
        </Card>
      </Page>
    );
  }

  if (error || !report) {
    return (
      <Page title="Daily Report" back tabs activeTab="Reports">
        <Card style={{ alignItems: "center", paddingVertical: 32 }}>
          <Notice tone="error">{error || "Report not found."}</Notice>
          <Button title="Retry" icon={ArrowClockwise} onPress={loadReport} style={{ marginTop: 16 }} />
        </Card>
      </Page>
    );
  }

  return (
    <Page
      title={`${childName}’s Day`}
      subtitle={formatDate(report.report_date)}
      back
      tabs
      activeTab="Reports"
    >
      {/* Child & Caregiver Banner */}
      <Card tint="#F2F0F8">
        <View style={s.row}>
          <Avatar source={artwork.child} />
          <View style={{ flex: 1 }}>
            <Text size={18} weight="semibold">
              {childName}
            </Text>
            <Text size={13} color="#7B7F89">
              {groupName} · Caregiver: {report.caregiver_name || "Staff"}
            </Text>
          </View>
        </View>
      </Card>

      {/* Meals & Nutrition Section */}
      <Section title="Meals & Nutrition" />
      <Card>
        {report.meals && report.meals.length > 0 ? (
          report.meals.map((m, idx) => (
            <View key={m.id || idx}>
              <View style={[s.row, { paddingVertical: 8 }]}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#FFF7CF", alignItems: "center", justifyContent: "center" }}>
                  <ForkKnife size={18} color="#DD7B13" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text weight="semibold" size={14}>
                    {m.meal_type ? m.meal_type.charAt(0).toUpperCase() + m.meal_type.slice(1) : "Meal"}
                  </Text>
                  <Text size={13} color="#606B74" style={{ marginTop: 2 }}>
                    {m.description}
                  </Text>
                </View>
                {m.portion && (
                  <Badge title={`Ate: ${m.portion}`} tone="neutral" />
                )}
              </View>
              {idx < report.meals.length - 1 && <View style={s.divider} />}
            </View>
          ))
        ) : (
          <Text color="#7B818D" size={13}>No meals recorded for this day.</Text>
        )}

        {report.meals && report.meals.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Get dinner ideas based on today's meals"
            onPress={() => {
              const mealsSummary = report.meals
                .map((m) => `${m.meal_type || "meal"}: ${m.description || ""}`)
                .join(", ");
              navigation.navigate("AIGuide", {
                initialPrompt: `Today ${childName} had ${mealsSummary} at daycare. Can you suggest a balanced, easy dinner idea for home to complement what they ate?`,
              });
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#FFF9E6",
              borderColor: "#F4E0A5",
              borderWidth: 1,
              borderRadius: 14,
              padding: 12,
              marginTop: 12,
              gap: 8,
            }}
          >
            <ForkKnife size={18} color="#D78B23" weight="bold" />
            <Text size={13} weight="semibold" color="#A86308" style={{ flex: 1 }}>
              💡 Get dinner ideas based on today’s meals →
            </Text>
          </Pressable>
        )}
      </Card>

      {/* Nap & Rest Section */}
      <Section title="Sleep & Rest" />
      <Card>
        <View style={s.row}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#F1EDF6", alignItems: "center", justifyContent: "center" }}>
            <Moon size={18} color="#6745AF" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text weight="semibold" size={14}>
              {report.sleep_duration_min ? `Nap: ${report.sleep_duration_min} minutes` : "Rest Period"}
            </Text>
            <Text size={13} color="#606B74" style={{ marginTop: 2 }}>
              {report.sleep_notes || "Child rested comfortably during scheduled nap time."}
            </Text>
          </View>
        </View>
      </Card>

      {/* Learning & Activities Section */}
      <Section title="Activities & Learning" />
      <Card>
        {report.activities && report.activities.length > 0 ? (
          report.activities.map((a, idx) => (
            <View key={a.id || idx}>
              <View style={[s.row, { paddingVertical: 8 }]}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#E8F6F3", alignItems: "center", justifyContent: "center" }}>
                  <PuzzlePiece size={18} color="#008794" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text weight="semibold" size={14}>
                    {(a.activity_type || "Activity").replace("_", " ").toUpperCase()}
                  </Text>
                  <Text size={13} color="#606B74" style={{ marginTop: 2 }}>
                    {a.description}
                  </Text>
                  {a.location && (
                    <Text size={11} color="#8A909B" style={{ marginTop: 2 }}>
                      Location: {a.location}
                    </Text>
                  )}
                </View>
              </View>
              {idx < report.activities.length - 1 && <View style={s.divider} />}
            </View>
          ))
        ) : (
          <Text color="#7B818D" size={13}>No specific activity items logged for this day.</Text>
        )}
      </Card>

      {/* Observations & Behavior Summary */}
      <Section title="Daily Observations & Mood" />
      <Card>
        <View style={{ paddingVertical: 6 }}>
          <Text size={12} color="#7B818D">RECORDED MOOD</Text>
          <Text weight="medium" style={{ marginTop: 3 }}>
            {report.mood ? (report.mood.charAt(0).toUpperCase() + report.mood.slice(1)) : "Calm and happy"}
          </Text>
        </View>
        {report.behavior_notes ? (
          <>
            <View style={s.divider} />
            <View style={{ paddingVertical: 6 }}>
              <Text size={12} color="#7B818D">BEHAVIOR & SOCIAL ENGAGEMENT</Text>
              <Text weight="medium" style={{ marginTop: 3 }}>{report.behavior_notes}</Text>
            </View>
          </>
        ) : null}
        {report.general_observations ? (
          <>
            <View style={s.divider} />
            <View style={{ paddingVertical: 6 }}>
              <Text size={12} color="#7B818D">CAREGIVER OBSERVATIONS</Text>
              <Text weight="medium" style={{ marginTop: 3 }}>{report.general_observations}</Text>
            </View>
          </>
        ) : null}
      </Card>

      {/* Caregiver Note Footer Card */}
      <Card tint="#0C263E" style={{ marginTop: 24 }}>
        <View style={s.row}>
          <Avatar source={artwork.caregiver} size={38} />
          <View>
            <Text color="#fff" weight="medium">
              Caregiver Note
            </Text>
            <Text color="#BDC9D7" size={12}>
              From {report.caregiver_name || "Caregiver"}
            </Text>
          </View>
        </View>
        <Text color="#E4EAF1" size={14} style={{ marginTop: 14, lineHeight: 20 }}>
          {report.general_observations || report.behavior_notes || "Thank you for another wonderful day at Ankelba daycare!"}
        </Text>
      </Card>

      <Button
        title="Message Caregiver"
        icon={ChatCircle}
        onPress={() => navigation.navigate("CaregiverChat", { threadId: 1 })}
        style={{ marginTop: 24, marginBottom: 20 }}
      />
    </Page>
  );
}
