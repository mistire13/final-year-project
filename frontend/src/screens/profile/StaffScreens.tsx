import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View, Pressable } from "react-native";
import {
  Page,
  Card,
  Text,
  Button,
  Field,
  Notice,
  MenuRow,
} from "../../components/design/System";
import { apiClient } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { ClipboardText } from "phosphor-react-native/src/icons/ClipboardText";
import { Heart } from "phosphor-react-native/src/icons/Heart";
import { CalendarBlank } from "phosphor-react-native/src/icons/CalendarBlank";
import { SignOut } from "phosphor-react-native/src/icons/SignOut";
import { SpeakerHigh } from "phosphor-react-native/src/icons/SpeakerHigh";
import { X } from "phosphor-react-native/src/icons/X";
function useAssigned() {
  const [kids, setKids] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get("/children", {
        params: { limit: 100 },
      });
      setKids(data.data || []);
      setError("");
    } catch {
      setError("Could not load assigned children. Please retry.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { kids, error, loading, load };
}
export function StaffHomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const { kids, error, loading, load } = useAssigned();
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [dismissed, setDismissed] = useState<number[]>([]);

  const loadAnnouncements = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/communication/announcements");
      setAnnouncements(data.data || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadAnnouncements();
    const unsubscribe = navigation.addListener?.("focus", loadAnnouncements);
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [navigation, loadAnnouncements]);

  const activeAnn = announcements.find((a) => !dismissed.includes(a.id));

  return (
    <Page
      title={`Hello, ${user?.name?.split(" ")[0] || "team"}`}
      subtitle="Your care workspace"
    >
      {activeAnn && (
        <Card
          tint="#FFFBEA"
          style={{
            borderColor: "#F6E4AC",
            borderWidth: 1.5,
            marginBottom: 16,
            padding: 16,
            borderRadius: 20,
            shadowColor: "#9C6B10",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 10,
          }}
          onPress={() =>
            navigation.navigate("MainTabs", {
              screen: "Messages",
              params: { tab: "Announcements" },
            })
          }
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <SpeakerHigh size={18} color="#9C6B10" weight="fill" />
              <Text
                size={11}
                color="#855B09"
                weight="bold"
                style={{ letterSpacing: 0.8, marginLeft: 6 }}
              >
                DAYCARE DIRECTIVE & ANNOUNCEMENT
              </Text>
              <View
                style={{
                  backgroundColor: "#BD4264",
                  paddingHorizontal: 6,
                  paddingVertical: 1.5,
                  borderRadius: 10,
                  marginLeft: 8,
                }}
              >
                <Text size={9} color="#fff" weight="bold">
                  NEW
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss announcement"
              hitSlop={12}
              onPress={(e: any) => {
                e?.stopPropagation?.();
                setDismissed((prev) => [...prev, activeAnn.id]);
                apiClient
                  .patch("/notifications/preferences", {
                    read_announcement_id: activeAnn.id,
                  })
                  .catch(() => {});
              }}
              style={{ padding: 4 }}
            >
              <X size={16} color="#855B09" />
            </Pressable>
          </View>
          <Text size={16} weight="bold" color="#10263D">
            {activeAnn.title}
          </Text>
          <Text
            size={13}
            color="#454D57"
            numberOfLines={2}
            style={{ marginTop: 4, lineHeight: 18 }}
          >
            {activeAnn.body}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 10,
              paddingTop: 8,
              borderTopWidth: 1,
              borderColor: "#EFE0BF",
            }}
          >
            <Text size={11} color="#855B09">
              Posted by {activeAnn.author_name || "Center Administration"}
            </Text>
            <Text size={11} color="#855B09" weight="bold">
              View bulletin →
            </Text>
          </View>
        </Card>
      )}
      <Card>
        <Text weight="bold">Today’s care</Text>
        <Text style={{ marginVertical: 12 }}>
          Choose an assigned child to record a report or health observation.
        </Text>
        <Button
          title="Daily reporting"
          onPress={() => navigation.navigate("MainTabs", { screen: "Reports" })}
        />
        <Button
          title="Health & incidents"
          variant="outline"
          onPress={() =>
            navigation.navigate("StaffCompose", { kind: "health" })
          }
          style={{ marginTop: 10 }}
        />
        <Button
          title="Calendar"
          variant="outline"
          onPress={() => navigation.navigate("CalendarPage")}
          style={{ marginTop: 10 }}
        />
      </Card>
      {loading ? (
        <ActivityIndicator />
      ) : error ? (
        <>
          <Notice>{error}</Notice>
          <Button title="Retry" onPress={load} />
        </>
      ) : kids.length ? (
        kids.map((c) => (
          <Card key={c.id} style={{ marginTop: 12 }}>
            <Text size={18} weight="bold">
              {c.full_name}
            </Text>
            <Text size={12}>{c.enrollment_status}</Text>
            <Button
              title="Write report"
              variant="outline"
              onPress={() =>
                navigation.navigate("StaffCompose", {
                  kind: "report",
                  childId: c.id,
                })
              }
            />
          </Card>
        ))
      ) : (
        <Notice>
          No children are assigned to your account. Contact your daycare
          administrator.
        </Notice>
      )}
    </Page>
  );
}
export function StaffReportsScreen({ navigation }: any) {
  return (
    <Page title="Daily reporting">
      <Notice>
        Create a report for an assigned child. Completed reports appear in the
        child’s report history.
      </Notice>
      <Button
        title="Write daily report"
        onPress={() => navigation.navigate("StaffCompose", { kind: "report" })}
      />
      <Button
        title="Health observation or incident"
        variant="outline"
        onPress={() => navigation.navigate("StaffCompose", { kind: "health" })}
        style={{ marginTop: 12 }}
      />
      <StaffHistory />
    </Page>
  );
}
function StaffHistory() {
  const { kids, error } = useAssigned();
  const [rows, setRows] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  return (
    <>
      <Text size={18} weight="bold" style={{ marginTop: 24 }}>
        Report history
      </Text>
      {error && <Notice>{error}</Notice>}
      {kids.map((c) => (
        <Button
          key={c.id}
          title={c.full_name}
          variant="outline"
          style={{ marginTop: 10 }}
          onPress={async () => {
            try {
              setRows(
                (await apiClient.get(`/reports/daily/child/${c.id}`)).data
                  .data || [],
              );
              setMessage("");
            } catch {
              setMessage("Could not load report history.");
            }
          }}
        />
      ))}
      {message && <Notice>{message}</Notice>}
      {rows.map((r) => (
        <Card key={r.id} style={{ marginTop: 12 }}>
          <Text weight="bold">{r.report_date}</Text>
          <Text>
            Mood: {r.mood || "Not recorded"} · Rest:{" "}
            {r.sleep_duration_min ?? "—"} minutes
          </Text>
        </Card>
      ))}
    </>
  );
}
export function StaffComposeScreen({ route, navigation }: any) {
  const health = route.params?.kind === "health";
  const { kids, error, loading, load } = useAssigned();
  const [child, setChild] = useState<number | undefined>(route.params?.childId);
  const [text, setText] = useState("");
  const [sleep, setSleep] = useState("");
  const [meal, setMeal] = useState("");
  const [activity, setActivity] = useState("");
  const [mood, setMood] = useState("happy");
  const [type, setType] = useState("health");
  const [severity, setSeverity] = useState("low");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [record, setRecord] = useState<number | null>(null);
  return (
    <Page title={health ? "Health & incidents" : "Write daily report"} back>
      {loading ? (
        <ActivityIndicator />
      ) : error ? (
        <>
          <Notice>{error}</Notice>
          <Button title="Retry" onPress={load} />
        </>
      ) : (
        <>
          <Text weight="bold">Choose a child</Text>
          <View style={{ gap: 8, marginVertical: 12 }}>
            {kids
              .filter((c) => c.enrollment_status === "active")
              .map((c) => (
                <Button
                  key={c.id}
                  title={c.full_name}
                  variant={child === c.id ? "primary" : "outline"}
                  onPress={() => {
                    setChild(c.id);
                    setRecord(null);
                  }}
                />
              ))}
          </View>
          {!kids.length && <Notice>No assigned children are available.</Notice>}
          <Card>
            {health ? (
              <>
                <Text weight="bold">Record type</Text>
                {["health", "incident"].map((t) => (
                  <Button
                    key={t}
                    title={t === "health" ? "Health observation" : "Incident"}
                    variant={type === t ? "primary" : "outline"}
                    onPress={() => setType(t)}
                  />
                ))}
                <Text weight="bold" style={{ marginTop: 16 }}>
                  Severity
                </Text>
                {["low", "moderate", "high"].map((t) => (
                  <Button
                    key={t}
                    title={t}
                    variant={severity === t ? "primary" : "outline"}
                    onPress={() => setSeverity(t)}
                  />
                ))}
              </>
            ) : (
              <>
                <Text weight="bold">Mood</Text>
                {["happy", "calm", "fussy", "tired", "excited"].map((t) => (
                  <Button
                    key={t}
                    title={t}
                    variant={mood === t ? "primary" : "outline"}
                    onPress={() => setMood(t)}
                  />
                ))}
                <Field
                  label="Rest (minutes)"
                  value={sleep}
                  onChangeText={setSleep}
                  keyboardType="numeric"
                />
                <Field
                  label="Lunch / meal"
                  value={meal}
                  onChangeText={setMeal}
                />
                <Field
                  label="Learning or play"
                  value={activity}
                  onChangeText={setActivity}
                />
              </>
            )}
            <Field
              label={health ? "What happened?" : "Care notes"}
              value={text}
              onChangeText={setText}
              multiline
            />
          </Card>
          {!!message && <Notice>{message}</Notice>}
          <Button
            title="Save record"
            loading={busy}
            disabled={!child || !!record}
            onPress={async () => {
              if (!child || busy) return;
              if (health && !text.trim()) {
                setMessage("Describe the observation or incident.");
                return;
              }
              if (
                !health &&
                sleep &&
                (!Number.isInteger(Number(sleep)) || Number(sleep) < 0)
              ) {
                setMessage("Enter a whole number of rest minutes.");
                return;
              }
              setBusy(true);
              try {
                const { data } = await apiClient.post(
                  health ? "/health" : "/reports/daily",
                  health
                    ? {
                        child_id: child,
                        record_type: type,
                        severity,
                        description: text.trim(),
                      }
                    : {
                        child_id: child,
                        mood,
                        sleep_duration_min: sleep ? Number(sleep) : null,
                        general_observations: text.trim(),
                        meals: meal.trim()
                          ? [{ meal_type: "lunch", description: meal.trim() }]
                          : [],
                        activities: activity.trim()
                          ? [
                              {
                                activity_type: "learning",
                                description: activity.trim(),
                              },
                            ]
                          : [],
                      },
                );
                setRecord(data.id || data.record?.id || -1);
                setMessage("Record saved.");
              } catch (e: any) {
                setMessage(
                  e.response?.data?.error || "Could not save. Please retry.",
                );
              } finally {
                setBusy(false);
              }
            }}
            style={{ marginTop: 16 }}
          />
          {health && record && record > 0 && (
            <Button
              title="Notify parent in the app"
              onPress={async () => {
                try {
                  await apiClient.patch(`/health/${record}/notify`);
                  setMessage("Parent notification recorded.");
                } catch {
                  setMessage("Could not notify the parent. Retry.");
                }
              }}
              style={{ marginTop: 10 }}
            />
          )}
        </>
      )}
    </Page>
  );
}
export function StaffAccountScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  return (
    <Page title="Team account">
      <Card>
        <Text size={22} weight="bold">
          {user?.name}
        </Text>
        <Text>{user?.email}</Text>
        <Text>
          {user?.role === "admin" ? "Daycare administrator" : "Caregiver"}
        </Text>
      </Card>
      <Button
        title="Security & password"
        variant="outline"
        onPress={() => navigation.navigate("Security")}
        style={{ marginTop: 16 }}
      />
      <Button
        title="Sign out"
        variant="danger"
        onPress={logout}
        style={{ marginTop: 12 }}
      />
    </Page>
  );
}
