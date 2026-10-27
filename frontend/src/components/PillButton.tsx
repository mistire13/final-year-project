import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';
import { ArrowRight } from "phosphor-react-native/src/icons/ArrowRight";
import { colors, radii } from '../theme/tokens';

export interface PillButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost';
  showArrow?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const PillButton: React.FC<PillButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  showArrow = false,
  leftIcon,
  rightIcon,
  fullWidth = true,
  disabled = false,
  loading = false,
  style,
  textStyle,
}) => {
  const getContainerStyle = (): ViewStyle => {
    switch (variant) {
      case 'secondary':
        return {
          backgroundColor: colors.bgInput,
          borderWidth: 1,
          borderColor: colors.borderCard,
        };
      case 'accent':
        return {
          backgroundColor: colors.accentGold,
        };
      case 'danger':
        return {
          backgroundColor: colors.pastelPink,
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
        };
      case 'primary':
      default:
        return {
          backgroundColor: colors.bgNavy,
        };
    }
  };

  const getTextStyle = (): TextStyle => {
    switch (variant) {
      case 'secondary':
        return { color: colors.textPrimary };
      case 'accent':
        return { color: colors.bgNavy };
      case 'danger':
        return { color: colors.pastelPinkText };
      case 'ghost':
        return { color: colors.textSecondary };
      case 'primary':
      default:
        return { color: colors.textWhite };
    }
  };

  const iconColor = getTextStyle().color as string;

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        getContainerStyle(),
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={iconColor} size="small" />
      ) : (
        <>
          {leftIcon ? <>{leftIcon}</> : null}
          <Text style={[styles.text, getTextStyle(), textStyle]}>{title}</Text>
          {showArrow && !rightIcon && (
            <ArrowRight size={18} color={iconColor} weight="bold" style={styles.rightMargin} />
          )}
          {rightIcon ? <>{rightIcon}</> : null}
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    columnGap: 8,
  },
  fullWidth: {
    width: '100%',
  },
  text: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  rightMargin: {
    marginLeft: 4,
  },
  disabled: {
    opacity: 0.55,
  },
});
