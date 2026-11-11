import React, { useState, useEffect, useCallback } from "react";
import { View, Pressable, ActivityIndicator } from "react-native";
import { MagnifyingGlass } from "phosphor-react-native/src/icons/MagnifyingGlass";
import { SpeakerHigh } from "phosphor-react-native/src/icons/SpeakerHigh";
import { CaretRight } from "phosphor-react-native/src/icons/CaretRight";
import { colors } from "../../theme/tokens";
import {
  Page,
  Text,
  Card,
  Avatar,
  Button,
  Field,
  Notice,
  s,
} from "../../components/design/System";
import { artwork } from "../../theme/assets";
import {
  getDirectMessages,
  getAnnouncements,
  getCommunicationContacts,
  DirectMessage,
  DaycareAnnouncement,
  CommunicationContact,
} from "../../api/parentApi";

interface ChatThreadSummary {
  id: number;
  recipientId: number;
  name: string;
  role: string;
  message: string;
  time: string;
  unread: number;
  photo?: any;
}

export function MessagesScreen({ navigation, route }: any) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"Messages" | "Announcements" | "Meal Plans">("Messages");
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [announcements, setAnnouncements] = useState<DaycareAnnouncement[]>([]);
  const [contacts, setContacts] = useState<CommunicationContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (["Messages", "Announcements", "Meal Plans"].includes(route?.params?.tab)) setTab(route.params.tab);
  }, [route?.params?.tab]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError("");
      const [msgData, annData, contactsData] = await Promise.all([
        getDirectMessages(),
        getAnnouncements(),
        getCommunicationContacts(),
      ]);
      setMessages(msgData);
      setAnnouncements(annData);
      setContacts(contactsData);
    } catch {
      setLoadError("Could not load messages and notices.");
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const unsubscribe = navigation.addListener?.("focus", loadData);
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [navigation, loadData]);

  const formatTime = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Build threads from contacts and database messages (F07 fix: dynamically target real daycare staff)
  const threads: ChatThreadSummary[] = [];

  if (contacts.length > 0) {
    contacts.forEach((contact, idx) => {
      const contactMsgs = messages
        .filter((m) => m.sender_id === contact.id || m.recipient_id === contact.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const latest = contactMsgs[0];
      const isCaregiver = contact.role === "caregiver";

      threads.push({
        id: idx + 1,
        recipientId: contact.id,
        name: contact.name,
        role: contact.title || (isCaregiver ? "Caregiver" : "Daycare office"),
        message: latest?.body || "",
        time: latest ? formatTime(latest.created_at) : "",
        unread: contactMsgs.filter((m) => !m.read_at && m.sender_id === contact.id).length,
        photo: isCaregiver ? artwork.caregiver : undefined,
      });
    });
  }

  const query = search.trim().toLowerCase();

  const visibleThreads = threads.filter((t) =>
    (t.name + " " + t.message + " " + t.role).toLowerCase().includes(query)
  );

  const visibleAnnouncements = announcements.filter((a) =>
    (a.title + " " + a.body + " " + (a.author_name || "")).toLowerCase().includes(query)
  );

  const visibleNotices = tab === "Meal Plans"
    ? visibleAnnouncements.filter((item) =>
        item.announcement_type === "meal_plan" || /meal|menu|lunch|snack/i.test(item.title + " " + item.body),
      )
    : visibleAnnouncements;

  return (
    <Page title="Messages">
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {([
          ["Messages", "Chats"],
          ["Announcements", "Notices"],
          ["Meal Plans", "Meals"],
        ] as const).map(([key, label]) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={key}
            accessibilityState={{ selected: tab === key }}
            onPress={() => setTab(key)}
            style={{
              flex: 1,
              minWidth: 64,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 6,
              paddingVertical: 8,
              borderRadius: 20,
              backgroundColor: tab === key ? colors.bgNavy : colors.bgMuted,
            }}
          >
            <Text size={13} color={tab === key ? colors.textWhite : colors.textSecondary} weight="semibold" style={{ textAlign: "center" }}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Field
        icon={MagnifyingGlass}
        placeholder={tab === "Messages" ? "Search chats" : tab === "Meal Plans" ? "Search meals" : "Search notices"}
        value={search}
        onChangeText={setSearch}
      />

      {loading ? (
        <ActivityIndicator accessibilityLabel="Loading messages and notices" color={colors.bgNavy} />
      ) : loadError ? (
        <>
          <Notice tone="error">{loadError}</Notice>
          <Button title="Retry" variant="secondary" onPress={loadData} />
        </>
      ) : tab === "Messages" ? (
        visibleThreads.length ? visibleThreads.map((thread) => (
          <Card
            key={thread.id}
            onPress={() => navigation.navigate("CaregiverChat", {
              threadId: thread.id,
              recipientId: thread.recipientId,
              recipientName: thread.name,
              recipientRole: contacts.find(contact => contact.id === thread.recipientId)?.role,
            })}
            style={{ marginBottom: 10, padding: 14 }}
          >
            <View style={[s.row, { alignItems: "flex-start" }]}>
              <Avatar source={thread.photo} initials={thread.name.slice(0, 2).toUpperCase()} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text size={16} weight="semibold" numberOfLines={2}>{thread.name}</Text>
                <Text size={12} color={colors.textSecondary} numberOfLines={2}>
                  {[thread.role, thread.time].filter(Boolean).join(" · ")}
                </Text>
                {!!thread.message && (
                  <Text size={13} color={colors.textSecondary} numberOfLines={2} style={{ marginTop: 4 }}>
                    {thread.message}
                  </Text>
                )}
              </View>
              {thread.unread > 0 && (
                <View
                  accessibilityLabel={`${thread.unread} unread messages`}
                  style={{
                    backgroundColor: colors.statusReadyBg,
                    paddingHorizontal: 7,
                    paddingVertical: 3,
                    borderRadius: 12,
                  }}
                >
                  <Text size={11} weight="bold">{thread.unread > 99 ? "99+" : thread.unread}</Text>
                </View>
              )}
            </View>
          </Card>
        )) : (
          <Notice>{query ? "No matching chats." : "No staff contacts yet. Contact your daycare for access."}</Notice>
        )
      ) : (
        <>
          {tab === "Meal Plans" && (
            <Button
              title="Ask for dinner ideas"
              variant="secondary"
              onPress={() => navigation.navigate("AIGuide", {
                initialPrompt: "Based on our daycare's weekly menu, can you suggest easy, balanced dinner ideas to balance what my child eats during the day?",
              })}
              style={{ marginBottom: 12 }}
            />
          )}
          {visibleNotices.length ? visibleNotices.map((item) => {
            const mealPlan = item.announcement_type === "meal_plan";
            return (
              <Card
                key={item.id}
                onPress={() => navigation.navigate("AnnouncementDetail", { announcementId: item.id })}
                tint={mealPlan ? colors.pastelGreen : colors.pastelYellow}
                style={{ marginBottom: 10, padding: 14, borderColor: colors.borderCard }}
              >
                <View style={s.row}>
                  <SpeakerHigh size={20} color={mealPlan ? colors.pastelGreenText : colors.pastelYellowText} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text size={15} weight="semibold" numberOfLines={2}>{item.title}</Text>
                    <Text size={12} color={colors.textSecondary}>
                      {item.announcement_type === "alert" ? "Important · " : ""}
                      {new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </Text>
                  </View>
                  <CaretRight size={16} color={colors.textSecondary} />
                </View>
              </Card>
            );
          }) : (
            <Notice>{query ? "No matching notices." : tab === "Meal Plans" ? "No meal plans yet." : "No notices yet."}</Notice>
          )}
        </>
      )}
      {query && !loading && !loadError && !(tab === "Messages" ? visibleThreads.length : visibleNotices.length) && (
        <Button title="Clear search" variant="secondary" onPress={() => setSearch("")} />
      )}
    </Page>
  );
}
