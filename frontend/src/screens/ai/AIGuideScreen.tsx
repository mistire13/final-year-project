import React, { useState, useEffect } from "react";
import { CaringBloom } from "../../components/design/Motion";
import { View, Pressable, TextInput } from "react-native";
import { ArrowLeft } from "phosphor-react-native/src/icons/ArrowLeft";
import { PaperPlaneRight } from "phosphor-react-native/src/icons/PaperPlaneRight";
import { Info } from "phosphor-react-native/src/icons/Info";
import { Lightbulb } from "phosphor-react-native/src/icons/Lightbulb";
import { ForkKnife } from "phosphor-react-native/src/icons/ForkKnife";
import { TShirt } from "phosphor-react-native/src/icons/TShirt";
import { Backpack } from "phosphor-react-native/src/icons/Backpack";
import { Clock } from "phosphor-react-native/src/icons/Clock";
import {
  Page,
  Text,
  Card,
  Avatar,
  IconButton,
  Notice,
  s,
} from "../../components/design/System";
import { artwork } from "../../theme/assets";
import { useAuth } from "../../context/AuthContext";
import { useChild } from "../../context/ChildContext";
import { apiClient } from "../../api/client";
const topics = [
  {
    title: "Activity Ideas",
    Icon: Lightbulb,
    color: "#E6EEFC",
    prompt: "What is a simple activity we can do after daycare?",
  },
  {
    title: "Meals",
    Icon: ForkKnife,
    color: "#FFF0C7",
    prompt: "Can you suggest a simple meal idea?",
  },
  {
    title: "Clothing",
    Icon: TShirt,
    color: "#FBE8D6",
    prompt: "What should I pack for changing weather?",
  },
  {
    title: "Daycare Prep",
    Icon: Backpack,
    color: "#EBEAED",
    prompt: "What should I pack for daycare?",
  },
  {
    title: "Routines",
    Icon: Clock,
    color: "#E6ECF8",
    prompt: "How can we make morning routines easier?",
  },
];
export function AIGuideScreen({ navigation, route }: any) {
  const { token, user } = useAuth();
  const { selectedChild } = useChild();
  const [input, setInput] = useState(route?.params?.initialPrompt || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<{ mine: boolean; text: string }[]>(
    [],
  );

  useEffect(() => {
    if (route?.params?.initialPrompt) {
      setInput(route.params.initialPrompt);
    }
  }, [route?.params?.initialPrompt]);
  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setInput("");
    setError("");
    setMessages((m) => [...m, { mine: true, text: question.trim() }]);
    setBusy(true);
    try {
      if (!token) {
        setMessages((m) => [
          ...m,
          {
            mine: false,
            text: "This is a design preview. Sign in to ask Ankelba a question.",
          },
        ]);
      } else {
        const res = await apiClient.post("/ai/guide", {
          question: question.trim(),
          child_id: selectedChild?.id,
        });
        setMessages((m) => [...m, { mine: false, text: res.data.answer }]);
      }
    } catch {
      setError("Ankelba is unavailable right now. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page
      header={false}
      toolbar={
        <View style={[s.row, { paddingVertical: 12, paddingHorizontal: 24 }]}>
          <IconButton
            icon={ArrowLeft}
            label="Go back"
            onPress={() => navigation.goBack()}
            background="#F3F1F5"
          />
          <Text size={21} weight="medium" style={{ flex: 1 }}>
            Ask Ankelba
          </Text>
          <Info size={23} color="#737A83" />
        </View>
      }
      scrollToEnd={messages.length > 0}
      contentStyle={{ paddingHorizontal: 24 }}
      footer={
        <View style={s.inputWrap}>
          <TextInput
            accessibilityLabel="Ask Ankelba"
            placeholder="Ask Ankelba something…"
            value={input}
            onChangeText={setInput}
            style={s.input}
            onSubmitEditing={() => ask(input)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send question"
            disabled={!input.trim() || busy}
            onPress={() => ask(input)}
            style={{
              backgroundColor: "#061224",
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: "center",
              justifyContent: "center",
              opacity: !input.trim() || busy ? 0.4 : 1,
            }}
          >
            <PaperPlaneRight size={21} color="white" />
          </Pressable>
        </View>
      }
    >
      <Text color="#7D818B" size={13} style={{ marginBottom: 24 }}>
        Prepared guidance for activities and routines. A generative AI provider is not connected.
      </Text>
      <Card tint="#FAF8F9" style={{ padding: 24 }}>
        <View style={s.row}>
          <CaringBloom />
          <Text size={17} style={{ flex: 1 }}>
            Hi {user?.name ? user.name.split(" ")[0] : "Parent"},{"\n"}How can I help you today?
          </Text>
        </View>
        <Text size={14} color="#6E7580" style={{ marginTop: 22 }}>
          Ideas for activities, meals, routines, and little everyday moments.
        </Text>
      </Card>
      <Card style={{ marginTop: 20, padding: 16 }}>
        <View style={s.row}>
          <Avatar source={selectedChild?.photo_url?{uri:selectedChild.photo_url}:undefined} initials={selectedChild?.full_name ? selectedChild.full_name.slice(0, 2).toUpperCase() : "CH"} />
          <View style={{ marginLeft: 10 }}>
            <Text size={10} color="#818690" style={{ letterSpacing: 1 }}>
              GUIDANCE FOR
            </Text>
            <Text size={17} weight="medium">
              {selectedChild?.full_name || "Enrolled Child"} · {selectedChild?.group_name || "Early Learning"}
            </Text>
          </View>
        </View>
      </Card>
      <Text
        size={13}
        color="#727985"
        style={{ marginTop: 28, marginBottom: 14, letterSpacing: 1 }}
      >
        WHAT CAN I HELP WITH?
      </Text>
      <View
        style={{
          flexDirection: "row",
          gap: 9,
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        {topics.map((t) => (
          <Pressable
            key={t.title}
            accessibilityRole="button"
            onPress={() => setInput(t.prompt)}
            style={[
              s.row,
              {
                paddingVertical: 10,
                paddingHorizontal: 13,
                borderRadius: 22,
                backgroundColor: t.color,
                gap: 7,
              },
            ]}
          >
            <t.Icon size={18} color="#4E6278" />
            <Text size={13} color="#4E6278">
              {t.title}
            </Text>
          </Pressable>
        ))}
      </View>
      {messages.length === 0 ? (
        <>
          <View
            style={{
              alignSelf: "flex-end",
              width: "86%",
              padding: 18,
              borderRadius: 22,
              backgroundColor: "#F8F6F5",
              marginBottom: 16,
            }}
          >
            <Text size={14}>
              My daughter is 4. What simple activity can we do after daycare?
            </Text>
          </View>
          <View
            style={{
              alignSelf: "flex-start",
              width: "90%",
              padding: 18,
              borderRadius: 22,
              backgroundColor: "#EDF1F9",
            }}
          >
            <Text size={14} color="#526D89">
              Example guidance: try a color-sorting game with safe household objects. Let your child
              group them by color, then name each one. Keep it short and
              playful.
            </Text>
          </View>
        </>
      ) : (
        messages.map((m, i) => (
          <View
            key={i}
            style={{
              padding: 18,
              borderRadius: 22,
              backgroundColor: m.mine ? "#F6F3F3" : "#EAF0F8",
              maxWidth: "90%",
              alignSelf: m.mine ? "flex-end" : "flex-start",
              marginBottom: 14,
            }}
          >
            <Text size={14} color="#526478">
              {m.text}
            </Text>
          </View>
        ))
      )}
      {busy && (
        <Text size={13} color="#7C8290">
          Thinking…
        </Text>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Notice>
        General guidance only. For medical, nutritional, or developmental
        concerns, speak with a qualified professional.
      </Notice>
    </Page>
  );
}
