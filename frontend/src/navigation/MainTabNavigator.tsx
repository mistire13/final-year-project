import { StaffHomeScreen, StaffReportsScreen, StaffAccountScreen } from "../screens/profile/StaffScreens";
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { HomeScreen } from "../screens/home/HomeScreen";
import { ReportsScreen } from "../screens/reports/ReportsScreen";
import { MessagesScreen } from "../screens/messages/MessagesScreen";
import { CalendarScreen } from "../screens/calendar/CalendarScreen";
import { ProfileScreen } from "../screens/profile/ProfileScreen";
import { BottomNavigation, tabsForRole } from "../components/design/System";
import { DaycareStoreScreen } from "../screens/store/DaycareStoreScreen";
import { WorkspaceScreen } from "../screens/profile/WorkspaceScreen";
import { useAuth } from "../context/AuthContext";
export type MainTabParamList = {
  Home: undefined;
  Reports: undefined;
  Messages: { tab?: "Messages" | "Announcements" | "Meal Plans" } | undefined;
  Shop: undefined;
  Workspace: undefined;
  Profile: undefined;
};
const Tab = createBottomTabNavigator<MainTabParamList>();
export function MainTabNavigator() {
  const { user } = useAuth();
  const staff = user?.role === "admin" || user?.role === "caregiver";
  const items = tabsForRole(user?.role);
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <BottomNavigation
          items={items}
          active={state.routes[state.index].name}
          onSelect={(name) => {
            const target = state.routes.find((r) => r.name === name);
            if (!target) return;
            const event = navigation.emit({
              type: "tabPress",
              target: target.key,
              canPreventDefault: true,
            });
            if (!event.defaultPrevented) navigation.navigate(name);
          }}
        />
      )}
    >
      <Tab.Screen name="Home" component={staff ? StaffHomeScreen : HomeScreen} />
      <Tab.Screen name="Reports" component={staff ? StaffReportsScreen : ReportsScreen} />
      <Tab.Screen name="Messages" component={MessagesScreen} />
      {staff ? (
        <Tab.Screen name="Workspace" component={WorkspaceScreen} />
      ) : (
        <Tab.Screen name="Shop" component={DaycareStoreScreen} />
      )}
      <Tab.Screen name="Profile" component={staff ? StaffAccountScreen : ProfileScreen} />
    </Tab.Navigator>
  );
}
