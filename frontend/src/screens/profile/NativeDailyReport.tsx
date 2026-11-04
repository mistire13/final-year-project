import React, { useState, useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import {
  Page,
  Text,
  Card,
  Field,
  Button,
  Notice,
} from "../../components/design/System";
import { apiClient } from "../../api/client";
import { useRemoteResource } from "../../hooks/useRemoteResource";
import {
  mealTypes,
  activityTypes,
  portions,
  locations,
  MealDraft,
  ActivityDraft,
  reportToday,
  reportPayload,
} from "./reportDraft";
const label = (s: string) => s.replace(/_/g, " ");
const emptyMeal = (): MealDraft => ({
  meal_type: "breakfast",
  description: "",
  portion: "good",
});
const emptyActivity = (): ActivityDraft => ({
  activity_type: "learning",
  description: "",
  location: "indoor",
});
function Choices({
  title,
  values,
  value,
  onChange,
  disabled = false,
}: {
  title: string;
  values: readonly string[];
  value: string;
  onChange: (s: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 6, marginBottom: 12 }}>
      <Text weight="bold">{title}</Text>
      {values.map((option) => (
        <Button
          key={option}
          title={`${title}: ${label(option)}`}
          variant={value === option ? "primary" : "outline"}
          disabled={disabled}
          onPress={() => onChange(option)}
        />
      ))}
    </View>
  );
}
export function NativeDailyReportScreen({ route, navigation }: any) {
  const assigned = useRemoteResource<any[]>(
    "report-assigned-children",
    async () =>
      (await apiClient.get("/children", { params: { limit: 100 } })).data
        .data || [],
    [],
  );
  const [child, setChild] = useState<number | undefined>(route.params?.childId);
  const [date, setDate] = useState(reportToday),
    [sleep, setSleep] = useState(""),
    [sleepNotes, setSleepNotes] = useState("");
  const [mood, setMood] = useState("happy"),
    [behavior, setBehavior] = useState(""),
    [notes, setNotes] = useState("");
  const [meals, setMeals] = useState<MealDraft[]>([emptyMeal()]),
    [activities, setActivities] = useState<ActivityDraft[]>([emptyActivity()]);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [saved, setSaved] = useState<number>();
  const selected = assigned.data.find(
    (c) => c.id === child && c.enrollment_status === "active",
  );
  const reset = () => {
    setSleep("");
    setSleepNotes("");
    setMood("happy");
    setBehavior("");
    setNotes("");
    setMeals([emptyMeal()]);
    setActivities([emptyActivity()]);
    setSaved(undefined);
    setMessage("");
  };
  const locked = busy || !!saved;
  const save = async () => {
    if (locked) return;
    if (!selected) {
      setMessage("Choose an active child assigned to you.");
      return;
    }
    let payload;
    try {
      payload = reportPayload({
        childId: selected.id,
        date,
        sleep,
        sleepNotes,
        mood,
        behavior,
        notes,
        meals,
        activities,
      });
    } catch (error: any) {
      setMessage(error.message);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { data } = await apiClient.post("/reports/daily", payload);
      setSaved(data.id);
      setMessage("Daily report saved. It is available to the linked parents.");
    } catch (error: any) {
      setMessage(
        error.response?.data?.error ||
          "Could not save. Your entries are still here; retry when connected.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page title="Write daily report" back>
      <Notice>
        Choose the child and date before recording care. Changing the child
        starts a blank report. Blank meal or activity rows are omitted.
      </Notice>
      {assigned.loading ? (
        <ActivityIndicator />
      ) : assigned.error ? (
        <>
          <Notice>{assigned.error}</Notice>
          <Button title="Retry assigned children" onPress={assigned.refresh} />
        </>
      ) : (
        <>
          <Text weight="bold">Assigned child</Text>
          {assigned.data
            .filter((c) => c.enrollment_status === "active")
            .map((c) => (
              <Button
                key={c.id}
                title={c.full_name}
                disabled={busy}
                variant={child === c.id ? "primary" : "outline"}
                onPress={() => {
                  if (child !== c.id) {
                    reset();
                    setChild(c.id);
                  }
                }}
              />
            ))}
          {!assigned.data.some((c) => c.enrollment_status === "active") && (
            <Notice>No active children are assigned to you.</Notice>
          )}
          {selected && (
            <Text weight="bold" style={{ marginVertical: 12 }}>
              Report for {selected.full_name}
            </Text>
          )}
          <Field
            label="Report date (YYYY-MM-DD)"
            value={date}
            editable={!locked}
            onChangeText={setDate}
            maxLength={10}
          />
          <Choices
            title="Mood"
            values={["happy", "calm", "fussy", "tired", "excited"]}
            value={mood}
            disabled={locked}
            onChange={setMood}
          />
          <Card>
            <Text size={18} weight="bold">
              Meals & snacks
            </Text>
            {meals.map((meal, index) => (
              <View key={index} style={{ marginTop: 16 }}>
                <Choices
                  title={`Meal ${index + 1} type`}
                  values={mealTypes}
                  value={meal.meal_type}
                  disabled={locked}
                  onChange={(value) =>
                    setMeals((rows) =>
                      rows.map((r, i) =>
                        i === index
                          ? { ...r, meal_type: value as MealDraft["meal_type"] }
                          : r,
                      ),
                    )
                  }
                />
                <Field
                  label={`Meal ${index + 1} description`}
                  value={meal.description}
                  editable={!locked}
                  maxLength={2000}
                  onChangeText={(value) =>
                    setMeals((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, description: value } : r,
                      ),
                    )
                  }
                />
                <Choices
                  title={`Meal ${index + 1} portion`}
                  values={portions}
                  value={meal.portion}
                  disabled={locked}
                  onChange={(value) =>
                    setMeals((rows) =>
                      rows.map((r, i) =>
                        i === index
                          ? { ...r, portion: value as MealDraft["portion"] }
                          : r,
                      ),
                    )
                  }
                />
                <Button
                  title={`Remove meal ${index + 1}`}
                  variant="danger"
                  disabled={locked}
                  onPress={() =>
                    setMeals((rows) => rows.filter((_, i) => i !== index))
                  }
                />
              </View>
            ))}
            <Button
              title="Add another meal or snack"
              variant="outline"
              disabled={locked || meals.length >= 10}
              onPress={() => setMeals((rows) => [...rows, emptyMeal()])}
            />
          </Card>
          <Card>
            <Text size={18} weight="bold">
              Sleep & rest
            </Text>
            <Field
              label="Rest (minutes)"
              keyboardType="numeric"
              value={sleep}
              editable={!locked}
              onChangeText={setSleep}
            />
            <Field
              label="Sleep notes"
              multiline
              value={sleepNotes}
              editable={!locked}
              maxLength={4000}
              onChangeText={setSleepNotes}
            />
          </Card>
          <Card>
            <Text size={18} weight="bold">
              Learning & play
            </Text>
            {activities.map((activity, index) => (
              <View key={index} style={{ marginTop: 16 }}>
                <Choices
                  title={`Activity ${index + 1} type`}
                  values={activityTypes}
                  value={activity.activity_type}
                  disabled={locked}
                  onChange={(value) =>
                    setActivities((rows) =>
                      rows.map((r, i) =>
                        i === index
                          ? {
                              ...r,
                              activity_type:
                                value as ActivityDraft["activity_type"],
                            }
                          : r,
                      ),
                    )
                  }
                />
                <Field
                  label={`Activity ${index + 1} description`}
                  value={activity.description}
                  editable={!locked}
                  maxLength={2000}
                  onChangeText={(value) =>
                    setActivities((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, description: value } : r,
                      ),
                    )
                  }
                />
                <Choices
                  title={`Activity ${index + 1} location`}
                  values={locations}
                  value={activity.location}
                  disabled={locked}
                  onChange={(value) =>
                    setActivities((rows) =>
                      rows.map((r, i) =>
                        i === index
                          ? {
                              ...r,
                              location: value as ActivityDraft["location"],
                            }
                          : r,
                      ),
                    )
                  }
                />
                <Button
                  title={`Remove activity ${index + 1}`}
                  variant="danger"
                  disabled={locked}
                  onPress={() =>
                    setActivities((rows) => rows.filter((_, i) => i !== index))
                  }
                />
              </View>
            ))}
            <Button
              title="Add another activity"
              variant="outline"
              disabled={locked || activities.length >= 20}
              onPress={() =>
                setActivities((rows) => [...rows, emptyActivity()])
              }
            />
          </Card>
          <Field
            label="Behavior observations"
            multiline
            value={behavior}
            editable={!locked}
            maxLength={4000}
            onChangeText={setBehavior}
          />
          <Field
            label="General care notes"
            multiline
            value={notes}
            editable={!locked}
            maxLength={4000}
            onChangeText={setNotes}
          />
          {!!message && <Notice>{message}</Notice>}
          <Button
            title="Save daily report"
            loading={busy}
            disabled={!selected || locked}
            onPress={save}
          />
          {!!saved && (
            <>
              <Button
                title="Read saved report"
                onPress={() =>
                  navigation.navigate("StaffReportDetail", { reportId: saved })
                }
              />
              <Button
                title="Start another report"
                variant="outline"
                onPress={() => {
                  reset();
                  setChild(undefined);
                  setDate(reportToday());
                }}
              />
            </>
          )}
        </>
      )}
    </Page>
  );
}
export function NativeReportHistory({
  childrenList,
  navigation,
}: {
  childrenList: any[];
  navigation: any;
}) {
  const [child, setChild] = useState<number>();
  const history = useRemoteResource<any[]>(
    `staff-report-history:${child || "none"}`,
    async () =>
      child
        ? (await apiClient.get(`/reports/daily/child/${child}`)).data.data || []
        : [],
    [],
  );
  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", history.refresh);
    return unsubscribe;
  }, [navigation, history.refresh]);
  return (
    <View style={{ marginTop: 24 }}>
      <Text size={18} weight="bold">
        Report history
      </Text>
      {childrenList.map((c) => (
        <Button
          key={c.id}
          title={`Reports for ${c.full_name}`}
          variant={child === c.id ? "primary" : "outline"}
          onPress={() => setChild(c.id)}
        />
      ))}
      {history.loading ? (
        <ActivityIndicator />
      ) : history.error ? (
        <>
          <Notice>{history.error}</Notice>
          <Button title="Retry report history" onPress={history.refresh} />
        </>
      ) : child && !history.data.length ? (
        <Notice>No daily reports are saved for this child.</Notice>
      ) : (
        history.data.map((report) => (
          <Card key={report.id}>
            <Text weight="bold">{String(report.report_date).slice(0, 10)}</Text>
            <Text>
              Mood: {report.mood || "Not recorded"} · Rest:{" "}
              {report.sleep_duration_min ?? "—"} minutes
            </Text>
            <Button
              title={`Read report for ${String(report.report_date).slice(0, 10)}`}
              onPress={() =>
                navigation.navigate("StaffReportDetail", {
                  reportId: report.id,
                })
              }
            />
          </Card>
        ))
      )}
    </View>
  );
}
export function StaffReportDetailScreen({ route }: any) {
  const id = route.params?.reportId;
  const report = useRemoteResource<any>(
    `staff-report:${id}`,
    async () => (await apiClient.get(`/reports/daily/${id}`)).data,
    null,
  );
  const row = report.data;
  return (
    <Page title="Daily report details" back>
      {report.loading ? (
        <ActivityIndicator />
      ) : report.error ? (
        <>
          <Notice>{report.error}</Notice>
          <Button title="Retry report" onPress={report.refresh} />
        </>
      ) : row ? (
        <>
          <Card>
            <Text size={22} weight="bold">
              {row.child_name}
            </Text>
            <Text>
              {String(row.report_date).slice(0, 10)} · {row.caregiver_name}
            </Text>
            <Text>Mood: {row.mood || "Not recorded"}</Text>
          </Card>
          <Card>
            <Text size={18} weight="bold">
              Meals & snacks
            </Text>
            {row.meals?.length ? (
              row.meals.map((m: any) => (
                <View key={m.id}>
                  <Text weight="bold">
                    {label(m.meal_type)} · Portion:{" "}
                    {m.portion || "Not recorded"}
                  </Text>
                  <Text>{m.description}</Text>
                </View>
              ))
            ) : (
              <Text>No meals recorded.</Text>
            )}
          </Card>
          <Card>
            <Text size={18} weight="bold">
              Sleep & rest
            </Text>
            <Text>{row.sleep_duration_min ?? "Not recorded"} minutes</Text>
            <Text>{row.sleep_notes || "No sleep notes."}</Text>
          </Card>
          <Card>
            <Text size={18} weight="bold">
              Learning & play
            </Text>
            {row.activities?.length ? (
              row.activities.map((a: any) => (
                <View key={a.id}>
                  <Text weight="bold">
                    {label(a.activity_type)} · {label(a.location || "n_a")}
                  </Text>
                  <Text>{a.description}</Text>
                </View>
              ))
            ) : (
              <Text>No activities recorded.</Text>
            )}
          </Card>
          <Card>
            <Text weight="bold">Behavior observations</Text>
            <Text>{row.behavior_notes || "No behavior notes."}</Text>
            <Text weight="bold">General observations</Text>
            <Text>
              {row.general_observations || "No general observations."}
            </Text>
          </Card>
        </>
      ) : (
        <Notice>Report unavailable.</Notice>
      )}
    </Page>
  );
}
