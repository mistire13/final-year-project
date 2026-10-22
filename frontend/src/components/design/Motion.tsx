import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  View,
  ViewStyle,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import Svg, { Circle, Path } from "react-native-svg";

const MotionContext = createContext(true);
const nativeDriver = Platform.OS !== "web";
export function MotionProvider({ children }: { children: ReactNode }) {
  // Start static until the platform preference is known.
  const [reduce, setReduce] = useState(true);
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => {
        changed = true;
        if (active) setReduce(value);
      },
    );
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active && !changed) setReduce(value);
      })
      .catch(() => {});
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);
  return (
    <MotionContext.Provider value={reduce}>{children}</MotionContext.Provider>
  );
}
export const useReducedMotion = () => useContext(MotionContext);

export function MotionView({
  children,
  style,
  delay = 0,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const focused = useIsFocused();
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    progress.stopAnimation();
    if (reduce || !focused) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const entrance = Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: nativeDriver,
    });
    entrance.start();
    return () => {
      entrance.stop();
      progress.setValue(1);
    };
  }, [reduce, focused, delay, progress]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.35, 1],
          }),
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [7, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export function MotionPressable({
  style,
  onPressIn,
  onPressOut,
  disabled,
  ...props
}: PressableProps) {
  const reduce = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    if (reduce || disabled) {
      scale.stopAnimation();
      scale.setValue(1);
    }
    return () => scale.stopAnimation();
  }, [reduce, disabled, scale]);
  const animate = (toValue: number) => {
    scale.stopAnimation();
    if (reduce || disabled) {
      scale.setValue(1);
      return;
    }
    Animated.timing(scale, {
      toValue,
      duration: toValue === 1 ? 160 : 90,
      easing: Easing.out(Easing.quad),
      useNativeDriver: nativeDriver,
    }).start();
  };
  if (Platform.OS === "web") {
    return (
      <Pressable
        {...props}
        disabled={disabled}
        onPressIn={(event) => {
          setPressed(true);
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          setPressed(false);
          onPressOut?.(event);
        }}
        style={(state) => [
          typeof style === "function" ? style(state) : style,
          !reduce && !disabled && state.pressed ? { transform: [{ scale: 0.98 }] } : null,
        ]}
      />
    );
  }

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => {
        setPressed(true);
        animate(0.98);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        animate(1);
        onPressOut?.(event);
      }}
      style={[
        typeof style === "function" ? style({ pressed }) : style,
        { transform: [{ scale }] },
      ]}
    />
  );
}

// Small original vector illustration. Plays twice on entry, then rests.
export function CaringBloom() {
  const reduce = useReducedMotion();
  const focused = useIsFocused();
  const beat = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    beat.stopAnimation();
    beat.setValue(0);
    if (reduce || !focused) return;
    const pulse = () =>
      Animated.sequence([
        Animated.timing(beat, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: nativeDriver,
        }),
        Animated.timing(beat, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: nativeDriver,
        }),
      ]);
    const animation = Animated.sequence([pulse(), pulse()]);
    animation.start();
    return () => {
      animation.stop();
      beat.setValue(0);
    };
  }, [reduce, focused, beat]);
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ width: 66, height: 66 }}
    >
      <Animated.View
        style={{
          transform: [
            {
              scale: beat.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.055],
              }),
            },
            {
              translateY: beat.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -2],
              }),
            },
          ],
        }}
      >
        <Svg width={66} height={66} viewBox="0 0 72 72">
          <Circle cx="36" cy="36" r="33" fill="#FFF0CD" />
          <Path
            d="M36 48C28 42 20 36 22 29C24 22 32 21 36 28C40 21 48 22 50 29C52 36 44 42 36 48Z"
            fill="#EF97AD"
          />
          <Path
            d="M20 45C22 54 29 58 36 59C43 58 50 54 52 45"
            fill="none"
            stroke="#7FAF92"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <Circle cx="16" cy="23" r="2.5" fill="#7FAF92" />
          <Circle cx="56" cy="20" r="3" fill="#E3B943" />
        </Svg>
      </Animated.View>
    </View>
  );
}
