import React from "react";
import { View, Platform } from "react-native";
import { AuthProvider } from "../context/AuthContext";
import { ChildProvider } from "../context/ChildContext";
import { DesignProvider } from "../context/DesignContext";
import { MotionProvider } from "../components/design/Motion";
import { RootNavigator } from "../navigation/RootNavigator";

/**
 * MobileShell encapsulates the dedicated Parent & Caregiver Mobile Application.
 * On Web, it renders inside a sleek mobile device frame.
 * On iOS / Android native, it takes the full device viewport.
 */
export default function MobileShell() {
  return (
    <View style={{ flex: 1, backgroundColor: "#F0EEE6", alignItems: "center" }}>
      <View
        style={{
          flex: 1,
          width: "100%",
          maxWidth: Platform.OS === "web" ? 480 : undefined,
        }}
      >
        <AuthProvider>
          <ChildProvider>
            <DesignProvider>
              <MotionProvider>
                <RootNavigator />
              </MotionProvider>
            </DesignProvider>
          </ChildProvider>
        </AuthProvider>
      </View>
    </View>
  );
}
