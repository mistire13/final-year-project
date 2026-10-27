import React, { useState, useEffect } from "react";
import { View, Pressable, ActivityIndicator } from "react-native";
import { CaretLeft } from "phosphor-react-native/src/icons/CaretLeft";
import { CaretRight } from "phosphor-react-native/src/icons/CaretRight";
import { Clock } from "phosphor-react-native/src/icons/Clock";
import { CalendarBlank } from "phosphor-react-native/src/icons/CalendarBlank";
import {
  Page,
  Text,
  Card,
  Button,
  Badge,
  s,
  IconButton,
  Section,
  Notice,
} from "../../components/design/System";
import { useRemoteResource } from "../../hooks/useRemoteResource";
import { getDaycareEvents, CalendarEvent } from "../../api/parentApi";

export function CalendarScreen({ navigation, route }: any) {
  const {
    data: eventsList,
    loading,
    error,
    refresh,
  } = useRemoteResource<CalendarEvent[]>(
    "calendar",
    () => getDaycareEvents(true),
    [],
  );
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [day, setDay] = useState<number | null>(null);
  const [filter, setFilter] = useState("All");

  const first = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();

  const change = (delta: number) => {
    const date = new Date(year, month + delta, 1);
    setMonth(date.getMonth());
    setYear(date.getFullYear());
    setDay(null);
  };

  const parsedEvents = eventsList.map((e) => {
    const d = new Date(e.event_date);
    return {
      ...e,
      day: d.getDate(),
      month: d.getMonth(),
      year: d.getFullYear(),
    };
  });

  const upcoming = parsedEvents.filter((e) => {
    const matchesFilter =
      filter === "All" ||
      e.event_type.toLowerCase().includes(filter.toLowerCase());
    if (!matchesFilter) return false;
    if (day !== null) {
      return e.day === day && e.month === month && e.year === year;
    }
    return e.month === month && e.year === year;
  });

  return (
    <Page
      title="Calendar"
      back={route?.name === "CalendarPage"}
      subtitle="Daycare activities and schedule."
    >
      {error ? (
        <>
          <Notice tone="error">{error}</Notice>
          <Button title="Retry" onPress={refresh} />
        </>
      ) : null}
      <View style={[s.row, { marginBottom: 20, flexWrap: "wrap", gap: 8 }]}>
        {["All", "Special", "Meeting", "Program"].map((f) => (
          <Pressable
            key={f}
            accessibilityRole="button"
            aria-pressed={filter === f}
            onPress={() => setFilter(f)}
            style={{
              paddingHorizontal: 15,
              paddingVertical: 8,
              borderRadius: 20,
              backgroundColor: filter === f ? "#061224" : "#F0EDF0",
            }}
          >
            <Text size={12} color={filter === f ? "white" : "#575D68"}>
              {f}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Month Navigator */}
      <Card style={{ padding: 14 }}>
        <View style={s.between}>
          <IconButton
            icon={CaretLeft}
            label="Previous month"
            onPress={() => change(-1)}
          />
          <Text weight="semibold">
            {new Date(year, month).toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </Text>
          <IconButton
            icon={CaretRight}
            label="Next month"
            onPress={() => change(1)}
          />
        </View>

        <View style={{ flexDirection: "row", marginVertical: 12 }}>
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <Text
              key={d}
              size={11}
              color="#9699A0"
              style={{ width: "14.285%", textAlign: "center" }}
            >
              {d}
            </Text>
          ))}
        </View>

        {/* Calendar Grid */}
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {Array.from({ length: first + count }, (_, i) => {
            const n = i - first + 1;
            const hasEvent = parsedEvents.some(
              (e) => e.day === n && e.month === month && e.year === year,
            );
            const isSelected = day === n;

            return (
              <View
                key={i}
                style={{
                  width: "14.285%",
                  aspectRatio: 1,
                  padding: 2,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                {n > 0 ? (
                  <Pressable
                    onPress={() => setDay(day === n ? null : n)}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isSelected
                        ? "#061224"
                        : hasEvent
                          ? "#FFE485"
                          : "transparent",
                    }}
                  >
                    <Text
                      size={13}
                      color={isSelected ? "white" : "#1B2E24"}
                      weight={hasEvent ? "bold" : "regular"}
                    >
                      {n}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      </Card>

      <Section title={day ? `Events on Day ${day}` : "Events this Month"} />

      {error ? null : loading ? (
        <View style={{ alignItems: "center", paddingVertical: 32 }}>
          <ActivityIndicator color="#061224" />
          <Text size={13} color="#7E828A" style={{ marginTop: 8 }}>
            Loading events…
          </Text>
        </View>
      ) : upcoming.length > 0 ? (
        upcoming.map((e) => (
          <Card
            key={e.id}
            onPress={() =>
              navigation.navigate("EventDetail", {
                eventId: e.id,
                eventData: e,
              })
            }
            style={{ marginBottom: 12, padding: 16 }}
          >
            <View style={s.between}>
              <Text size={16} weight="semibold" style={{ flex: 1 }}>
                {e.title}
              </Text>
              <Badge title={e.event_type.replace("_", " ")} tone="neutral" />
            </View>
            <Text size={13} color="#7E828A" style={{ marginTop: 6 }}>
              {new Date(e.event_date).toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
              {e.event_time ? ` · ${e.event_time}` : ""}
            </Text>
            {e.description ? (
              <Text
                size={13}
                color="#4A5568"
                style={{ marginTop: 6 }}
                numberOfLines={2}
              >
                {e.description}
              </Text>
            ) : null}
          </Card>
        ))
      ) : (
        <Card style={{ padding: 24, alignItems: "center" }}>
          <CalendarBlank size={32} color="#8A909B" />
          <Text size={15} weight="medium" style={{ marginTop: 8 }}>
            No events scheduled
          </Text>
          <Text size={13} color="#7E828A" style={{ marginTop: 4 }}>
            Check back later for newly scheduled daycare programs.
          </Text>
        </Card>
      )}
    </Page>
  );
}
