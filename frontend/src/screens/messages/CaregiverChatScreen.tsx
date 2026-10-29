import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, TextInput, Pressable, Image, ActivityIndicator } from "react-native";
import { ArrowLeft } from "phosphor-react-native/src/icons/ArrowLeft";
import { PaperPlaneRight } from "phosphor-react-native/src/icons/PaperPlaneRight";
import { Lock } from "phosphor-react-native/src/icons/Lock";
import { ChatCircle } from "phosphor-react-native/src/icons/ChatCircle";
import { WarningCircle } from "phosphor-react-native/src/icons/WarningCircle";
import {
  Page,
  Text,
  Avatar,
  IconButton,
  Notice,
  s,
} from "../../components/design/System";
import { artwork } from "../../theme/assets";
import {
  getDirectMessages,
  sendDirectMessage,
  markMessageAsRead,
  DirectMessage,
  getCommunicationContacts,
} from "../../api/parentApi";
import { useAuth } from "../../context/AuthContext";

export function CaregiverChatScreen({ navigation, route }: any) {
  const { user } = useAuth();
  const recipientId = Number(route.params?.recipientId);
  const validRecipient = Number.isSafeInteger(recipientId) && recipientId > 0;
  const [recipientRole,setRecipientRole]=useState<string | undefined>(route.params?.recipientRole);
  const isOffice = recipientRole === "admin";
  const recipientName: string = route.params?.recipientName || "Daycare staff";

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const requestRevision=useRef(0);
  useEffect(()=>{
    let active=true;
    setRecipientRole(route.params?.recipientRole);
    getCommunicationContacts().then(contacts=>{if(active)setRecipientRole(contacts.find(c=>c.id===recipientId)?.role);}).catch(()=>{});
    return()=>{active=false;};
  },[recipientId,route.params?.recipientRole]);

  const loadMessages = useCallback(async () => {
    const revision=++requestRevision.current;
    setMessages([]);setLoading(true);
    if (!validRecipient) {
      setErrorMessage("Choose a staff contact from Messages to start a conversation.");
      setLoading(false);
      return;
    }
    try {
      setErrorMessage("");
      const list = await getDirectMessages(recipientId);
      if(revision!==requestRevision.current)return;
      // Backend returns ordered created_at DESC; sort ASC for chat chronological view
      const sorted = [...list].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setMessages(sorted);

      // F13 fix: Mark unread incoming messages as read so badges clear immediately
      const unreadIncoming = list.filter((m) => m.recipient_id === user?.id && !m.read_at);
      if (unreadIncoming.length > 0) {
        await Promise.all(unreadIncoming.map((m) => markMessageAsRead(m.id)));
      }
    } catch (err: any) {
      if(revision===requestRevision.current)setErrorMessage("Could not load messages. Please check your connection.");
    } finally {
      if(revision===requestRevision.current)setLoading(false);
    }
  }, [recipientId, validRecipient, user?.id]);


  useEffect(() => {
    setInput('');
    loadMessages();
    return()=>{requestRevision.current++;};
  }, [loadMessages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending || !validRecipient) return;

    setSending(true);
    setErrorMessage("");

    try {
      const revision=requestRevision.current;
      const sent = await sendDirectMessage(recipientId, text, isOffice ? "Office Inquiry" : "Daycare Inquiry");
      if(revision!==requestRevision.current)return;
      setMessages((prev) => [...prev, sent]);
      setInput("");
    } catch (err: any) {
      setErrorMessage("Failed to send message. Please retry.");
    } finally {
      setSending(false);
    }
  };

  const formatMessageTime = (isoString?: string) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Page
      header={false}
      toolbar={
        <View style={[s.row, { paddingVertical: 14, paddingHorizontal: 16 }]}>
          <IconButton
            icon={ArrowLeft}
            label="Go back"
            onPress={() => navigation.goBack()}
          />
          <Avatar
            source={recipientRole === 'caregiver' ? artwork.caregiver : undefined}
            initials={recipientRole === 'caregiver' ? undefined : recipientName.slice(0, 2).toUpperCase()}
            size={42}
          />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text size={18} weight="semibold">
              {recipientName}
            </Text>
            <Text size={12} color="#7D838C">
              {isOffice ? "Center Administration & Front Desk" : recipientRole==='caregiver' ? "Classroom Educator" : recipientRole==='parent' ? "Parent / Guardian" : "Daycare Staff"}
            </Text>
          </View>
        </View>
      }
      scrollToEnd={messages.length > 0}
      contentStyle={{ paddingTop: 8, paddingHorizontal: 16 }}
      footer={
        <View style={{ paddingBottom: 6 }}>
          {errorMessage ? (
            <View
              style={[
                s.row,
                {
                  backgroundColor: "#FFF3F3",
                  padding: 8,
                  borderRadius: 10,
                  marginBottom: 8,
                },
              ]}
            >
              <WarningCircle size={16} color="#C92A2A" />
              <Text size={12} color="#C92A2A" style={{ marginLeft: 6, flex: 1 }}>
                {errorMessage}
              </Text>
            </View>
          ) : null}

          <View style={s.inputWrap}>
            <TextInput
              accessibilityLabel="Message"
              placeholder={isOffice ? "Ask the office a question…" : "Message caregiver…"}
              placeholderTextColor="#9EA3AC"
              style={[s.input, { flex: 1 }]}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleSend}
              editable={!sending}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send message"
              disabled={!input.trim() || sending}
              onPress={handleSend}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: "#061224",
                alignItems: "center",
                justifyContent: "center",
                opacity: input.trim() && !sending ? 0.99 : 0.4,
              }}
            >
              {sending ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <PaperPlaneRight color="white" size={18} weight="fill" />
              )}
            </Pressable>
          </View>
        </View>
      }
    >
      <View
        style={[
          s.row,
          {
            justifyContent: "center",
            backgroundColor: "#F2F3F5",
            borderRadius: 20,
            paddingVertical: 6,
            paddingHorizontal: 14,
            marginBottom: 20,
            alignSelf: "center",
          },
        ]}
      >
        <Lock size={13} color="#7D838C" style={{ marginRight: 6 }} />
        <Text size={11} color="#7D838C">
          Private message with your daycare
        </Text>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: "center" }}>
          <ActivityIndicator size="small" color="#061224" />
          <Text size={13} color="#8A919B" style={{ marginTop: 10 }}>
            Loading conversation…
          </Text>
        </View>
      ) : messages.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 40 }}>
          <ChatCircle size={44} color="#C5CAD3" />
          <Text size={16} weight="medium" style={{ marginTop: 12 }}>
            No messages yet
          </Text>
          <Text size={13} color="#8A919B" style={{ marginTop: 6, textAlign: "center", maxWidth: 280 }}>
            Send a message to {recipientName}. They will receive it in their portal immediately.
          </Text>
        </View>
      ) : (
        messages.map((m) => {
          const isMine = m.sender_id === user?.id || (m.sender_name && m.sender_name.toLowerCase().includes("parent"));
          return (
            <View
              key={m.id}
              style={{
                maxWidth: "85%",
                alignSelf: isMine ? "flex-end" : "flex-start",
                marginBottom: 16,
              }}
            >
              <View
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 18,
                  borderBottomRightRadius: isMine ? 4 : 18,
                  borderBottomLeftRadius: isMine ? 18 : 4,
                  backgroundColor: isMine ? "#10263D" : "#FFFFFF",
                  borderWidth: isMine ? 0 : 1,
                  borderColor: "#E8E7E2",
                  shadowColor: "#000",
                  shadowOpacity: 0.03,
                  shadowOffset: { width: 0, height: 1 },
                  shadowRadius: 2,
                }}
              >
                <Text size={14} color={isMine ? "#FFFFFF" : "#323842"} style={{ lineHeight: 20 }}>
                  {m.body}
                </Text>
              </View>
              <Text
                size={10}
                color="#8B919B"
                style={{ marginTop: 4, textAlign: isMine ? "right" : "left", marginHorizontal: 4 }}
              >
                {formatMessageTime(m.created_at)}
                {isMine ? (m.read_at ? " ✓✓ Read" : " ✓ Sent") : ""}
              </Text>
            </View>
          );
        })
      )}
    </Page>
  );
}
