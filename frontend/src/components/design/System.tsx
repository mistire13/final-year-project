import React, { ReactNode } from "react";
import { MotionPressable, MotionView, useReducedMotion } from "./Motion";
import {
  View,
  Text as NativeText,
  TextProps,
  TextStyle,
  StyleSheet,
  ViewStyle,
  StyleProp,
  ScrollView,
  Image,
  ImageSourcePropType,
  TextInput,
  TextInputProps,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { ArrowLeft } from "phosphor-react-native/src/icons/ArrowLeft";
import { BellSimple } from "phosphor-react-native/src/icons/BellSimple";
import { CaretRight } from "phosphor-react-native/src/icons/CaretRight";
import { House } from "phosphor-react-native/src/icons/House";
import { ClipboardText } from "phosphor-react-native/src/icons/ClipboardText";
import { ChatCircle } from "phosphor-react-native/src/icons/ChatCircle";
import { CalendarBlank } from "phosphor-react-native/src/icons/CalendarBlank";
import { User } from "phosphor-react-native/src/icons/User";
import { Storefront } from "phosphor-react-native/src/icons/Storefront";
import { SquaresFour } from "phosphor-react-native/src/icons/SquaresFour";
import { ArrowRight } from "phosphor-react-native/src/icons/ArrowRight";
import { X } from "phosphor-react-native/src/icons/X";
import Svg, { Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import { colors, fonts, radii, shadows } from "../../theme/tokens";
import { useAuth } from "../../context/AuthContext";
import { apiClient } from "../../api/client";

export const Text = ({
  style,
  size,
  weight,
  color,
  ...props
}: TextProps & {
  size?: number;
  weight?: "regular" | "medium" | "semibold" | "bold";
  color?: string;
}) => {
  const flat = StyleSheet.flatten(style) || {};
  const numeric = Number(flat.fontWeight || 400);
  const family =
    weight ||
    (numeric >= 700
      ? "bold"
      : numeric >= 600
        ? "semibold"
        : numeric >= 500
          ? "medium"
          : "regular");
  return (
    <NativeText
      {...props}
      style={[
        {
          fontSize: size || 15,
          color: color || colors.textPrimary,
          lineHeight: (size || 15) * 1.5,
        },
        style,
        { fontFamily: fonts[family], fontWeight: "normal" },
      ]}
    />
  );
};

export function SoftBackground({
  decorative = false,
}: {
  decorative?: boolean;
}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="warm" cx="0" cy="0" r="1">
            <Stop offset="0" stopColor="#FFE9AD" stopOpacity=".24" />
            <Stop offset="1" stopColor="#FFFBEF" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="cool" cx="1" cy=".7" r="1">
            <Stop offset="0" stopColor="#E2EAF6" stopOpacity=".24" />
            <Stop offset="1" stopColor="#FFFBEF" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#warm)" />
        <Rect width="100%" height="100%" fill="url(#cool)" />
      </Svg>
      {decorative && (
        <>
          <View
            style={{
              position: "absolute",
              width: 230,
              height: 230,
              borderRadius: 115,
              backgroundColor: "#F8EDCF",
              opacity: 0.65,
              left: -125,
              top: 20,
            }}
          />
          <View
            style={{
              position: "absolute",
              width: 95,
              height: 95,
              borderRadius: 50,
              backgroundColor: "#F4DFCE",
              opacity: 0.6,
              right: -30,
              top: 135,
            }}
          />
          <View
            style={{
              position: "absolute",
              width: 225,
              height: 225,
              borderRadius: 120,
              backgroundColor: "#E5EAF5",
              opacity: 0.8,
              right: -105,
              bottom: -45,
            }}
          />
          <View
            style={{
              position: "absolute",
              width: 96,
              height: 96,
              borderRadius: 48,
              backgroundColor: "#FAEED7",
              left: -32,
              bottom: 65,
            }}
          />
        </>
      )}
    </View>
  );
}

export function CardGlow({ color = "#FFE39A" }: { color?: string }) {
  const id = React.useId().replace(/:/g, "");
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={id} cx="100%" cy="0%" rx="85%" ry="100%">
            <Stop offset="0" stopColor={color} stopOpacity=".55" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
export const BrandMark = ({ size = 30 }: { size?: number }) => (
  <Image
    accessibilityLabel="Ankelba"
    source={require("../../../design/figma-exports/ankelba-symbol.png")}
    style={{ width: size * 0.66, height: size }}
    resizeMode="contain"
  />
);
export function IconButton({
  icon: Icon,
  onPress,
  label,
  color = colors.textPrimary,
  background = "transparent",
  size = 22,
  disabled = false,
}: {
  icon: any;
  onPress: () => void;
  label: string;
  color?: string;
  background?: string;
  size?: number;
  disabled?: boolean;
}) {
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: background,
          opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
        },
      ]}
    >
      <Icon size={size} color={color} />
    </MotionPressable>
  );
}
export function Header() {
  const navigation = useNavigation<any>();
  const [badgeCount, setBadgeCount] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    const fetchBadges = () => {
      apiClient
        .get("/notifications")
        .then(({ data }) => {
          if (active) setBadgeCount(data.total_badges || 0);
        })
        .catch(() => {});
    };
    fetchBadges();
    const unsubscribe = navigation.addListener?.("focus", fetchBadges);
    return () => {
      active = false;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [navigation]);

  return (
    <View style={s.header}>
      <MotionPressable
        accessibilityRole="button"
        accessibilityLabel="Ankelba home"
        onPress={() => navigation.navigate("MainTabs", { screen: "Home" })}
        style={s.row}
      >
        <BrandMark size={31} />
        <Text size={25} weight="semibold">
          Ankelba
        </Text>
      </MotionPressable>
      <View style={s.row}>
        <View style={{ position: "relative" }}>
          <IconButton
            icon={BellSimple}
            label="Notifications"
            onPress={() => navigation.navigate("Notifications")}
          />
          {badgeCount > 0 && (
            <View
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                minWidth: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: "#DC2626",
                borderWidth: 1.5,
                borderColor: "#fff",
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 3,
              }}
            >
              <NativeText
                style={{
                  fontSize: 9,
                  fontWeight: "bold",
                  color: "#fff",
                  fontFamily: fonts.bold,
                }}
              >
                {badgeCount > 9 ? "9+" : badgeCount}
              </NativeText>
            </View>
          )}
        </View>
        <MotionPressable
          accessibilityRole="button"
          accessibilityLabel="Your profile"
          onPress={() => navigation.navigate("MainTabs", { screen: "Profile" })}
          style={s.brandAvatar}
        >
          <BrandMark size={27} />
        </MotionPressable>
      </View>
    </View>
  );
}
export function Page({
  children,
  title,
  subtitle,
  back = false,
  header = true,
  tabs = false,
  activeTab,
  footer,
  toolbar,
  scroll = true,
  scrollToEnd = false,
  decorative = false,
  contentStyle,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  back?: boolean;
  header?: boolean;
  tabs?: boolean;
  activeTab?: string;
  footer?: ReactNode;
  toolbar?: ReactNode;
  scroll?: boolean;
  scrollToEnd?: boolean;
  decorative?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const nav = useNavigation<any>();
  const scrollRef = React.useRef<ScrollView>(null);
  const reduceMotion = useReducedMotion();
  const heading = title ? (
    <View style={{ marginBottom: 24 }}>
      <View style={[s.row, { gap: 12 }]}>
        {back && (
          <IconButton
            icon={ArrowLeft}
            label="Go back"
            onPress={() => nav.goBack()}
            background="#F1EFEF"
          />
        )}
        <Text
          size={back ? 20 : 27}
          weight={back ? "medium" : "bold"}
          style={{ flex: 1 }}
        >
          {title}
        </Text>
      </View>
      {!!subtitle && (
        <Text color={colors.textSecondary} style={{ marginTop: 8 }}>
          {subtitle}
        </Text>
      )}
    </View>
  ) : null;
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={s.page}>
      <SoftBackground decorative={decorative} />
      {header && <Header />}
      {toolbar}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <MotionView style={{ flex: 1 }}>
          {scroll ? (
            <ScrollView
              ref={scrollRef}
              onContentSizeChange={() => {
                if (scrollToEnd)
                  scrollRef.current?.scrollToEnd({ animated: !reduceMotion });
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[s.content, contentStyle]}
            >
              {heading}
              {children}
            </ScrollView>
          ) : (
            <View style={[s.content, { flex: 1 }, contentStyle]}>
              {heading}
              {children}
            </View>
          )}
        </MotionView>
        {footer && (
          <SafeAreaView edges={["bottom"]} style={s.footer}>
            {footer}
          </SafeAreaView>
        )}
      </KeyboardAvoidingView>
      {tabs && <BottomNavigation active={activeTab} />}
    </SafeAreaView>
  );
}
export function Card({
  children,
  style,
  tint,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tint?: string;
  onPress?: () => void;
}) {
  const cardStyle = [s.card, tint ? { backgroundColor: tint } : null, style];
  return onPress ? (
    <MotionPressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [cardStyle, { opacity: pressed ? 0.8 : 1 }]}
    >
      {children}
    </MotionPressable>
  ) : (
    <MotionView style={cardStyle}>{children}</MotionView>
  );
}
export function Button({
  title,
  onPress,
  variant = "primary",
  icon: Icon,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "danger";
  icon?: any;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const dark = variant === "primary";
  const c = dark
    ? "#fff"
    : variant === "danger"
      ? "#D75345"
      : colors.textPrimary;
  return (
    <MotionPressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{
        disabled: !!disabled || !!loading,
        busy: !!loading,
      }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor: dark
            ? colors.bgNavy
            : variant === "secondary"
              ? "#F1F0F3"
              : "transparent",
          borderWidth: variant === "outline" || variant === "danger" ? 1 : 0,
          borderColor: variant === "danger" ? "#F1B5A9" : colors.borderCard,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c} />
      ) : (
        <>
          <Text weight="medium" color={c}>
            {title}
          </Text>
          {Icon && <Icon color={c} size={20} />}
        </>
      )}
    </MotionPressable>
  );
}
export function Field({
  label,
  icon: Icon,
  style,
  ...props
}: TextInputProps & { label?: string; icon?: any }) {
  return (
    <View style={{ marginBottom: 20 }}>
      {!!label && (
        <Text weight="semibold" size={14} style={{ marginBottom: 8 }}>
          {label}
        </Text>
      )}
      <View style={s.inputWrap}>
        {Icon && <Icon size={21} color={colors.textSecondary} />}
        <TextInput
          {...props}
          accessibilityLabel={
            props.accessibilityLabel || label || props.placeholder
          }
          placeholderTextColor="#9295A1"
          style={[
            s.input,
            props.multiline
              ? { height: 100, textAlignVertical: "top", paddingTop: 14 }
              : null,
            style,
          ]}
        />
      </View>
    </View>
  );
}
export function Avatar({
  source,
  size = 52,
  initials,
}: {
  source?: ImageSourcePropType;
  size?: number;
  initials?: string;
}) {
  return source ? (
    <Image
      source={source}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.bgMuted,
      }}
      resizeMode="cover"
    />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#F9EBC6",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text weight="semibold" size={size * 0.3}>
        {initials || "A"}
      </Text>
    </View>
  );
}
export function Badge({
  title,
  tone = "green",
}: {
  title: string;
  tone?: "green" | "gold" | "red" | "neutral";
}) {
  const pair = {
    green: ["#E9F5E7", "#387F42"],
    gold: ["#FFF0BC", "#926B00"],
    red: ["#FDE8E4", "#BD534C"],
    neutral: ["#F0EFF3", "#6B707A"],
  }[tone];
  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 9,
        backgroundColor: pair[0],
      }}
    >
      <Text size={11} weight="medium" color={pair[1]}>
        {title}
      </Text>
    </View>
  );
}
export function Section({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={[s.between, { marginTop: 26, marginBottom: 15 }]}>
      <Text size={20} weight="medium">
        {title}
      </Text>
      {!!action && (
        <MotionPressable
          accessibilityRole="button"
          onPress={onPress}
          hitSlop={8}
        >
          <Text size={14}>{action} →</Text>
        </MotionPressable>
      )}
    </View>
  );
}
export function MenuRow({
  title,
  icon: Icon,
  onPress,
  detail,
  children,
  last = false,
}: {
  title: string;
  icon?: any;
  onPress?: () => void;
  detail?: string;
  children?: ReactNode;
  last?: boolean;
}) {
  const content = (
    <>
      <View style={[s.row, { flex: 1, gap: 12 }]}>
        {Icon && <Icon size={21} color={colors.textSecondary} />}
        <Text>{title}</Text>
      </View>
      {!!detail && (
        <Text size={13} color={colors.textSecondary}>
          {detail}
        </Text>
      )}
      {children || <CaretRight size={16} color={colors.textSecondary} />}
    </>
  );
  const style = { ...s.menuRow, borderBottomWidth: last ? 0 : 1 };
  return onPress ? (
    <MotionPressable accessibilityRole="button" onPress={onPress} style={style}>
      {content}
    </MotionPressable>
  ) : (
    <View style={style}>{content}</View>
  );
}
export function Notice({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "error" | "success";
}) {
  return (
    <View
      accessibilityRole={tone === "error" ? "alert" : undefined}
      style={{
        padding: 14,
        borderRadius: 16,
        backgroundColor:
          tone === "error"
            ? "#FCE9E3"
            : tone === "success"
              ? "#EDF7E9"
              : "#F2F1EA",
        marginVertical: 12,
      }}
    >
      <Text
        size={13}
        color={tone === "error" ? "#A9453C" : colors.textSecondary}
      >
        {children}
      </Text>
    </View>
  );
}
export const tabsConfig = [
  { name: "Home", Icon: House },
  { name: "Reports", Icon: ClipboardText },
  { name: "Messages", Icon: ChatCircle },
  { name: "Shop", Icon: Storefront },
  { name: "Profile", Icon: User },
];
export const tabsForRole = (role?: string) =>
  tabsConfig.map((item) =>
    (role === "admin" || role === "caregiver") && item.name === "Shop"
      ? { name: "Workspace", Icon: SquaresFour, label: role === "admin" ? "Admin" : "Staff" }
      : item,
  );
export function BottomNavigation({
  active,
  onSelect,
  items,
}: {
  active?: string;
  onSelect?: (name: string) => void;
  items?: { name: string; Icon: typeof House; label?: string }[];
}) {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const visibleItems = items || tabsForRole(user?.role);
  return (
    <SafeAreaView edges={["bottom"]} style={s.tabBar}>
      <View style={{ flexDirection: "row" }}>
        {visibleItems.map(({ name, Icon, label }: { name: string; Icon: typeof House; label?: string }) => (
          <MotionPressable
            key={name}
            accessibilityRole="tab"
            accessibilityLabel={label || name}
            accessibilityState={{ selected: name === active }}
            aria-selected={name === active}
            onPress={() =>
              onSelect
                ? onSelect(name)
                : nav.navigate("MainTabs", { screen: name })
            }
            style={s.tab}
          >
            <View
              style={[
                s.tabInner,
                active === name && { backgroundColor: "#FFF1D5" },
              ]}
            >
              <Icon
                size={23}
                color={active === name ? colors.textPrimary : "#6B7280"}
                weight={active === name ? "bold" : "regular"}
              />
              <Text
                size={9}
                weight={active === name ? "bold" : "medium"}
                color={active === name ? colors.textPrimary : "#6B7280"}
              >
                {(label || name).toUpperCase()}
              </Text>
            </View>
          </MotionPressable>
        ))}
      </View>
    </SafeAreaView>
  );
}
export const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bgApp },
  content: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
    flexGrow: 1,
  },
  header: {
    height: 70,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  brandAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F5F1DF",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.94)",
    padding: 20,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: "rgba(237,231,216,0.5)",
    ...shadows.card,
  },
  button: {
    minHeight: 54,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  inputWrap: {
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: "#EEECEF",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#E6E3E4",
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 54,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.textPrimary,
    paddingVertical: 12,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: colors.bgApp,
  },
  tabBar: {
    backgroundColor: "#FFFCF3",
    borderTopWidth: 1,
    borderTopColor: "#F2EEDC",
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8 },
  tabInner: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 14,
    paddingVertical: 5,
    width: "100%",
  },
  menuRow: {
    minHeight: 58,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomColor: "#F0EEEB",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 12,
    justifyContent: "space-between",
  },
  half: { width: "48%" },
  muted: { color: colors.textSecondary },
  divider: { height: 1, backgroundColor: "#EBE8E4", marginVertical: 18 },
});
