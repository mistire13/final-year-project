import React from "react";
import { useReducedMotion } from "../components/design/Motion";
import {
  NavigationContainer,
  DefaultTheme,
  NavigatorScreenParams,
} from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { MainTabNavigator, MainTabParamList } from "./MainTabNavigator";
import { SplashScreen } from "../screens/auth/SplashScreen";
import { OnboardingScreen } from "../screens/auth/OnboardingScreen";
import { LoginScreen, RegisterScreen } from "../screens/auth/LoginScreen";
import { ForgotPasswordScreen } from "../screens/auth/ForgotPasswordScreen";
import { OTPScreen } from "../screens/auth/OTPScreen";
import { ChildProfileWizardScreen } from "../screens/auth/ChildProfileWizardScreen";

import { FullDailyReportScreen } from "../screens/reports/FullDailyReportScreen";
import { ChildProfileScreen } from "../screens/profile/ChildProfileScreen";
import { ParentProfileScreen } from "../screens/profile/ParentProfileScreen";
import { AuthorizedGuardiansScreen } from "../screens/profile/AuthorizedGuardiansScreen";
import { GuardianDetailsScreen } from "../screens/profile/GuardianDetailsScreen";
import { AddGuardianScreen } from "../screens/profile/AddGuardianScreen";
import { PickupVerificationScreen } from "../screens/profile/PickupVerificationScreen";
import { CaregiverChatScreen } from "../screens/messages/CaregiverChatScreen";
import { AIGuideScreen } from "../screens/ai/AIGuideScreen";
import { DaycareStoreScreen } from "../screens/store/DaycareStoreScreen";
import { ShoppingCartScreen } from "../screens/store/ShoppingCartScreen";
import { CheckoutScreen } from "../screens/store/CheckoutScreen";
import { OrderConfirmationScreen } from "../screens/store/OrderConfirmationScreen";
import { EventDetailScreen } from "../screens/calendar/EventDetailScreen";
import { CalendarScreen } from "../screens/calendar/CalendarScreen";
import {
  OrdersScreen,
  NotificationsScreen,
  SecurityScreen,
} from "../screens/profile/AccountScreens";
import { HealthNoticesScreen } from "../screens/health/HealthNoticesScreen";
import { AttendanceHistoryScreen } from "../screens/attendance/AttendanceHistoryScreen";
import { PaymentVerificationScreen } from "../screens/store/PaymentVerificationScreen";
import { ReportsHistoryScreen } from "../screens/reports/ReportsHistoryScreen";

export type RootStackParamList = {
  Splash: { stay?: boolean } | undefined;
  Onboarding: undefined;
  Login: { mode?: "signin" | "register" } | undefined;
  Register: undefined;
  ForgotPassword: undefined;
  OTP: { email?: string } | undefined;
  ChildProfileWizard: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;

  FullDailyReport: { reportId?: number; childId?: number } | undefined;
  ReportsHistory: { childId?: number } | undefined;
  ChildProfile: { childId?: number } | undefined;
  ParentProfile: undefined;
  AuthorizedGuardians: undefined;
  GuardianDetails: { guardianId: number; guardian?: any };
  AddGuardian: undefined;
  PickupVerification: { guardianId?: number } | undefined;
  CaregiverChat: { threadId?: number; recipientId?: number; name?: string } | undefined;
  AIGuide: { initialPrompt?: string } | undefined;
  DaycareStore: undefined;
  ShoppingCart: undefined;
  Checkout: undefined;
  PaymentVerification: { orderId?: number; orderRef?: string; totalAmount?: number } | undefined;
  OrderConfirmation: { orderRef?: string; totalAmount?: number; paymentVerified?: boolean } | undefined;
  EventDetail: { eventId?: number } | undefined;
  Orders: undefined;
  Notifications: undefined;
  Security: undefined;
  CalendarPage: undefined;
  HealthNotices: { childId?: number } | undefined;
  AttendanceHistory: { childId?: number } | undefined;
};
const Stack = createStackNavigator<RootStackParamList>();
export function RootNavigator() {
  const reduceMotion = useReducedMotion();
  return (
    <NavigationContainer
      theme={{
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: "#FFFBED",
          card: "#FFFBED",
          primary: "#061224",
        },
      }}
    >
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
          animation: reduceMotion ? "none" : "fade",
          cardStyle: {
            backgroundColor: "#FFFBED",
            flex: 1,
            overflow: "hidden",
          },
        }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="CalendarPage" component={CalendarScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="OTP" component={OTPScreen} />
        <Stack.Screen name="ChildProfileWizard" component={ChildProfileWizardScreen} />
        <Stack.Screen name="MainTabs" component={MainTabNavigator} />

        <Stack.Screen
          name="FullDailyReport"
          component={FullDailyReportScreen}
        />
        <Stack.Screen name="ChildProfile" component={ChildProfileScreen} />
        <Stack.Screen name="ParentProfile" component={ParentProfileScreen} />
        <Stack.Screen
          name="AuthorizedGuardians"
          component={AuthorizedGuardiansScreen}
        />
        <Stack.Screen name="AddGuardian" component={AddGuardianScreen} />
        <Stack.Screen
          name="GuardianDetails"
          component={GuardianDetailsScreen}
        />
        <Stack.Screen
          name="PickupVerification"
          component={PickupVerificationScreen}
        />
        <Stack.Screen name="CaregiverChat" component={CaregiverChatScreen} />
        <Stack.Screen name="AIGuide" component={AIGuideScreen} />
        <Stack.Screen name="DaycareStore" component={DaycareStoreScreen} />
        <Stack.Screen name="ShoppingCart" component={ShoppingCartScreen} />
        <Stack.Screen name="Checkout" component={CheckoutScreen} />
        <Stack.Screen
          name="PaymentVerification"
          component={PaymentVerificationScreen}
        />
        <Stack.Screen
          name="OrderConfirmation"
          component={OrderConfirmationScreen}
        />
        <Stack.Screen name="EventDetail" component={EventDetailScreen} />
        <Stack.Screen name="Orders" component={OrdersScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="Security" component={SecurityScreen} />
        <Stack.Screen name="HealthNotices" component={HealthNoticesScreen} />
        <Stack.Screen name="AttendanceHistory" component={AttendanceHistoryScreen} />
        <Stack.Screen name="ReportsHistory" component={ReportsHistoryScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
