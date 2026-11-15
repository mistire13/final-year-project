import React from "react";
import PortalGate from "./src/portal/PortalGate";
import { MotionProvider } from "./src/components/design/Motion";
import { DesignProvider } from "./src/context/DesignContext";
import { View, ActivityIndicator, Platform, Text } from "react-native";
import {
  useFonts,
  Quicksand_400Regular,
  Quicksand_500Medium,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
} from "@expo-google-fonts/quicksand";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/context/AuthContext";
import { ChildProvider } from "./src/context/ChildContext";
import {RootNavigator} from "./src/navigation/RootNavigator";

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Quicksand_400Regular,
    Quicksand_500Medium,
    Quicksand_600SemiBold,
    Quicksand_700Bold,
  });
  if (!fontsLoaded && !fontError)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#FFFBED",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color="#061224" />
      </View>
    );
  return (
    <SafeAreaProvider>
      <PortalGate>
        <View
          style={{ flex: 1, backgroundColor: "#F0EEE6", alignItems: "center" }}
        >
          <View
            style={{
              flex: 1,
              width: "100%",
              maxWidth: Platform.OS === "web" ? 480 : undefined,
            }}
          >
            <AuthProvider>
              <ChildProvider>
                <StatusBar style="dark" />
                <DesignProvider>
                  <MotionProvider>
                    <RootNavigator />
                  </MotionProvider>
                </DesignProvider>
              </ChildProvider>
            </AuthProvider>
          </View>
        </View>
      </PortalGate>
    </SafeAreaProvider>
  );
}
