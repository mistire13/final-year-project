import React, { useEffect } from "react";
import { View, useWindowDimensions, Pressable, Platform, Linking, Image } from "react-native";
import { ArrowRight, ShieldCheck } from "phosphor-react-native";
import { Page, Text, Button, BrandMark } from "../../components/design/System";
import { useAuth } from "../../context/AuthContext";
import { getWebPortalUrl } from "../../utils/host";

export function SplashScreen({ navigation, route }: any) {
  const { user, isLoading, logout } = useAuth();
  const { width } = useWindowDimensions();
  const size = Math.min(width, 480);

  useEffect(() => {
    if (route?.params?.stay) {
      return;
    }
    if (!isLoading && user) {
      if (user.role === "parent" && user.profile_complete === false) {
        navigation.replace("ChildProfileWizard");
      } else {
        navigation.replace("MainTabs");
      }
    }
  }, [isLoading, user, navigation, route?.params?.stay]);

  return (
    <Page
      header={false}
      decorative
      contentStyle={{ paddingHorizontal: 32, paddingTop: 0 }}
    >
      <View style={{ position: "absolute", left: 32, top: 28 }}>
        <BrandMark size={82} />
      </View>
      <View
        style={{
          alignItems: "center",
          marginHorizontal: -32,
          marginTop: 24,
          justifyContent: "center",
        }}
      >
        <Image
          source={require("../../../assets/ankelba-artwork.jpg")}
          style={{
            width: size * 0.88,
            height: ((size * 0.88) * 360) / 480,
            borderRadius: 24,
          }}
          resizeMode="contain"
        />
      </View>
      <Text
        size={19}
        weight="medium"
        style={{ textAlign: "center", marginTop: 8 }}
      >
        Stay connected to their day.
      </Text>
      <View style={{ flex: 1, minHeight: 90 }} />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          gap: 10,
          marginBottom: 32,
        }}
      >
        {["#FFD9D2", "#FFC42B", "#B4CAEB"].map((c) => (
          <View
            key={c}
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: c,
            }}
          />
        ))}
      </View>
      {user ? (
        <View style={{ gap: 10 }}>
          <Button
            title="Go to Home Dashboard"
            icon={ArrowRight}
            onPress={() => navigation.navigate("MainTabs")}
          />
          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              await logout();
              navigation.replace("Splash", { stay: true });
            }}
            style={{ marginTop: 8, alignItems: "center", paddingVertical: 8 }}
          >
            <Text size={13} color="#C53030" weight="semibold">
              Sign Out ({user.name})
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Button
            title="Get Started"
            icon={ArrowRight}
            onPress={() => navigation.navigate("Onboarding")}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate("Login")}
            style={{ marginTop: 14, alignItems: "center", paddingVertical: 8 }}
          >
            <Text size={14} color="#061224" weight="semibold">
              Already have an account? Sign In
            </Text>
          </Pressable>
        </>
      )}
      <Pressable
        accessibilityRole="link"
        onPress={() => {
          if (Platform.OS === "web") {
            window.location.assign("/admin");
          } else {
            Linking.openURL(getWebPortalUrl("/admin"));
          }
        }}
        style={{
          marginTop: 14,
          paddingVertical: 9,
          paddingHorizontal: 16,
          borderRadius: 20,
          backgroundColor: "#E8F6F3",
          alignItems: "center",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <ShieldCheck size={16} color="#008794" weight="bold" />
          <Text size={13} color="#008794" weight="bold">
            Open Daycare Admin Portal →
          </Text>
        </View>
      </Pressable>
      <Text
        size={11}
        color="#787D87"
        style={{
          textAlign: "center",
          letterSpacing: 1.4,
          marginTop: 24,
          marginBottom: 20,
        }}
      >
        CONNECTING FAMILIES AND DAYCARE
      </Text>
    </Page>
  );
}
