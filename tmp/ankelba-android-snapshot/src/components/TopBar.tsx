import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { BellSimple } from "phosphor-react-native/src/icons/BellSimple";
import { Sparkle } from "phosphor-react-native/src/icons/Sparkle";
import { colors, radii, shadows } from '../theme/tokens';
import { useAuth } from '../context/AuthContext';

export interface TopBarProps {
  onPressNotifications?: () => void;
  onPressProfile?: () => void;
  unreadNotifications?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  onPressNotifications,
  onPressProfile,
  unreadNotifications = true,
}) => {
  const { user } = useAuth();

  const getInitials = (name?: string) => {
    if (!name) return 'AN';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <View style={styles.container}>
      {/* Brand Logo & Name */}
      <View style={styles.brandContainer}>
        <View style={styles.logoBadge}>
          <Sparkle size={18} color={colors.accentGold} weight="fill" />
        </View>
        <View>
          <Text style={styles.brandTitle}>Ankelba</Text>
          <Text style={styles.brandSubtitle}>PARENT PORTAL</Text>
        </View>
      </View>

      {/* Action Controls */}
      <View style={styles.actionsContainer}>
        {/* Notification Bell */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onPressNotifications}
          style={styles.iconButton}
        >
          <BellSimple size={22} color={colors.textPrimary} weight="bold" />
          {unreadNotifications && <View style={styles.unreadDot} />}
        </TouchableOpacity>

        {/* Parent Profile Avatar */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onPressProfile}
          style={styles.avatarButton}
        >
          <View style={styles.avatarInner}>
            <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: colors.bgApp,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.bgNavy,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginTop: -2,
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: radii.pill,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...shadows.card,
  },
  unreadDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accentRed,
    borderWidth: 1.5,
    borderColor: colors.bgSurface,
  },
  avatarButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: colors.accentGold,
    padding: 2,
    backgroundColor: colors.bgSurface,
  },
  avatarInner: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: colors.bgNavy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textWhite,
  },
});
