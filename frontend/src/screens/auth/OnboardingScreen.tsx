import React, { useState } from "react";
import { MotionView } from "../../components/design/Motion";
import { View, Image, Pressable } from "react-native";
import { ArrowRight } from "phosphor-react-native/src/icons/ArrowRight";
import { Page, Text, Button } from "../../components/design/System";
import { artwork } from "../../theme/assets";
const slides = [
  {
    title: "Know Their Day",
    text: "Little moments, meals, naps, and discoveries. Stay close to their day.",
    image: artwork.onboardingDay,
  },
  {
    title: "Stay Connected",
    text: "A little update. A reassuring message. Your daycare, always within reach.",
    image: artwork.onboardingConnection,
  },
  {
    title: "Safe & Supportive",
    text: "Trusted guardians and thoughtful care, all in one place.",
    image: artwork.onboardingSafety,
  },
];
export function OnboardingScreen({ navigation }: any) {
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  return (
    <Page
      header={false}
      decorative
      contentStyle={{ paddingHorizontal: 32, paddingTop: 70 }}
    >
      <MotionView key={index} style={{ flex: 1, justifyContent: "center" }}>
        <View
          style={{
            alignSelf: "center",
            width: 260,
            height: 260,
            borderRadius: 32,
            backgroundColor: "#fff",
            overflow: "hidden",
            marginBottom: 36,
            boxShadow: "0px 8px 20px rgba(35,39,52,0.06)",
          }}
        >
          <Image
            source={slide.image}
            style={{ width: "100%", height: "100%" }}
            resizeMode="contain"
          />
        </View>
        <Text size={29} weight="bold" style={{ textAlign: "center" }}>
          {slide.title}
        </Text>
        <Text
          color="#68707B"
          style={{
            textAlign: "center",
            marginTop: 16,
            lineHeight: 25,
            paddingHorizontal: 12,
          }}
        >
          {slide.text}
        </Text>
      </MotionView>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          gap: 8,
          marginVertical: 30,
        }}
      >
        {slides.map((_, i) => (
          <View
            key={i}
            style={{
              width: i === index ? 24 : 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: i === index ? "#061224" : "#CECED4",
            }}
          />
        ))}
      </View>
      {index === 2 ? (
        <View style={{ gap: 12 }}>
          <Button
            title="Get Daycare Access"
            icon={ArrowRight}
            onPress={() => navigation.navigate("Register")}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate("Login")}
            style={{
              paddingVertical: 12,
              alignItems: "center",
              backgroundColor: "#EBEAEF",
              borderRadius: 24,
            }}
          >
            <Text size={14} weight="semibold" color="#061224">
              Sign In to Existing Account
            </Text>
          </Pressable>
        </View>
      ) : (
        <Button
          title="Next"
          icon={ArrowRight}
          onPress={() => setIndex(index + 1)}
        />
      )}
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate("Register")}
        style={{ padding: 18, alignItems: "center" }}
      >
        <Text size={14} color="#727782">
          New parent? Ask your daycare for access
        </Text>
      </Pressable>
    </Page>
  );
}
